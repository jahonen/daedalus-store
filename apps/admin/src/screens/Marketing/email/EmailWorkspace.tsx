import { useEffect, useState } from "react";
import { doc, getDoc, collection, getDocs, limit, query } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Checkbox,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import {
  parseCsv,
  csvCell,
  companySettingsSchema,
  emailContentSchema,
  emailSettingsSchema,
  emailScheduleIso,
  renderEmail,
  type EmailContent,
  type EmailSettings,
  type CompanySettings,
} from "@daedalus/shared";
import { db, fns } from "../../../lib/firebase";
import { trackEvent } from "../../../lib/analytics";
import "./EmailWorkspace.scss";

type EmailRow = {
  id: string;
  status?: string;
  email?: string;
  subject?: string;
  kind?: string;
  source?: string;
  revision?: number;
  content?: EmailContent;
  history?: { role: "user" | "assistant"; text: string }[];
  approximateOpens?: number;
  error?: string;
  suppression?: string;
  measurement?: boolean;
};
const invoke = async <T,>(name: string, data: unknown): Promise<T> =>
  (await httpsCallable<unknown, T>(fns, name)(data)).data;
const initial: EmailContent = {
  subject: "",
  preheader: "",
  blocks: [{ type: "paragraph", text: "" }],
};
export function EmailWorkspace() {
  const [tab, setTab] = useState(0);
  const [company, setCompany] = useState<CompanySettings | null>(null);
  const [settings, setSettings] = useState<EmailSettings>(emailSettingsSchema.parse({}));
  const [content, setContent] = useState<EmailContent>(initial);
  const [id, setId] = useState<string>();
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<EmailRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [history, setHistory] = useState<{ role: "user" | "assistant"; text: string }[]>([]);
  const [address, setAddress] = useState("");
  const [testTo, setTestTo] = useState("");
  const [schedule, setSchedule] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [audienceCount, setAudienceCount] = useState<number>();
  const [statusFilter, setStatusFilter] = useState("");
  const [searchEmail, setSearchEmail] = useState("");
  const [importEntries, setImportEntries] = useState<
    { email: string; consentAt: string; evidence: string }[]
  >([]);
  const [importCount, setImportCount] = useState(0);
  const [redaction, setRedaction] = useState<{ id: string; retained: string; count: number }>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [media, setMedia] = useState<{ id: string; url: string; alt: string }[]>([]);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setNotice("");
    try {
      await action();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };
  const load = async (kind: "contacts" | "campaigns" | "deliveries", after?: string) => {
    const result = await invoke<{ records: EmailRow[]; cursor: string | null }>(
      "listEmailRecords",
      {
        kind,
        ...(after ? { cursor: after } : {}),
        ...(kind === "contacts" && statusFilter ? { status: statusFilter } : {}),
        ...(kind === "contacts" && searchEmail ? { email: searchEmail.trim() } : {}),
      },
    );
    setRows((previous) => (after ? [...previous, ...result.records] : result.records));
    setCursor(result.cursor);
  };
  useEffect(() => {
    void run(async () => {
      const [c, s, assets] = await Promise.all([
        getDoc(doc(db, "settings/company")),
        getDoc(doc(db, "settings/email")),
        getDocs(query(collection(db, "media"), limit(100))),
      ]);
      setCompany(companySettingsSchema.parse(c.data()));
      setSettings(emailSettingsSchema.parse(s.data() ?? {}));
      setMedia(
        assets.docs.map((asset) => ({
          id: asset.id,
          url: String(asset.get("publicUrl") ?? ""),
          alt: String(asset.get("altText") ?? ""),
        })),
      );
    });
  }, []);
  useEffect(() => {
    setRows([]);
    setCursor(null);
    if (tab > 0 && tab < 4)
      void run(() => load(tab === 1 ? "contacts" : tab === 2 ? "campaigns" : "deliveries"));
  }, [tab]);
  const save = async () => {
    const result = await invoke<{ id: string; revision: number }>("saveEmailCampaign", {
      ...(id ? { id } : {}),
      revision,
      content: emailContentSchema.parse(content),
      history: history.slice(-20),
    });
    setId(result.id);
    setRevision(result.revision);
    return result;
  };
  let preview = "";
  let previewText = "";
  try {
    if (company) {
      const rendered = renderEmail({
        company,
        settings,
        content,
        unsubscribeUrl: "https://example.com/unsubscribe",
        preferencesUrl: "https://example.com/preferences",
      });
      preview = rendered.html;
      previewText = rendered.text;
    }
  } catch {
    preview = "<p>Add a subject and valid content to preview.</p>";
  }
  const updateBlock = (index: number, patch: Record<string, string>) =>
    setContent({
      ...content,
      blocks: content.blocks.map((block, i) =>
        i === index ? ({ ...block, ...patch } as EmailContent["blocks"][number]) : block,
      ),
    });
  return (
    <Box className="email-workspace">
      <Alert severity={settings.marketingPaused ? "warning" : "info"}>
        {settings.marketingPaused
          ? "Marketing is paused. Complete sender, webhook and queue setup before enabling broadcasts."
          : "Marketing enabled. Review every audience and content revision before sending."}
      </Alert>
      <Tabs
        value={tab}
        onChange={(_, value: number) => {
          setTab(value);
          trackEvent("email_workspace_tab", { tab: value });
        }}
        variant="scrollable"
      >
        {["Compose", "Audience", "Campaigns", "Delivery health", "Email settings"].map((label) => (
          <Tab key={label} label={label} />
        ))}
      </Tabs>
      {notice && <Alert severity="info">{notice}</Alert>}
      {tab === 0 && (
        <div className="email-composer">
          <Stack spacing={2}>
            <TextField
              label="Subject"
              value={content.subject}
              onChange={(e) => setContent({ ...content, subject: e.target.value })}
            />
            <TextField
              label="Preheader"
              value={content.preheader}
              onChange={(e) => setContent({ ...content, preheader: e.target.value })}
            />
            {content.blocks.map((block, index) => (
              <Card key={index}>
                <CardContent>
                  <Stack spacing={1}>
                    <Typography variant="overline">{block.type}</Typography>
                    {block.type === "image" ? (
                      <>
                        <TextField
                          label="Image URL"
                          value={block.url}
                          onChange={(e) => updateBlock(index, { url: e.target.value })}
                        />
                        <TextField
                          label="Alternative text"
                          value={block.alt}
                          onChange={(e) => updateBlock(index, { alt: e.target.value })}
                        />
                      </>
                    ) : (
                      <>
                        <TextField
                          label="Text"
                          multiline
                          minRows={block.type === "paragraph" ? 3 : 1}
                          value={block.text}
                          onChange={(e) => updateBlock(index, { text: e.target.value })}
                        />
                        {block.type === "button" && (
                          <TextField
                            label="HTTPS destination"
                            value={block.url}
                            onChange={(e) => updateBlock(index, { url: e.target.value })}
                          />
                        )}
                      </>
                    )}
                    <Stack direction="row" spacing={1}>
                      <Button
                        disabled={index === 0}
                        onClick={() => {
                          const blocks = [...content.blocks];
                          [blocks[index - 1], blocks[index]] = [blocks[index], blocks[index - 1]];
                          setContent({ ...content, blocks });
                        }}
                      >
                        Move up
                      </Button>
                      <Button
                        onClick={() =>
                          setContent({
                            ...content,
                            blocks: content.blocks.filter((_, i) => i !== index),
                          })
                        }
                      >
                        Remove
                      </Button>
                    </Stack>
                  </Stack>
                </CardContent>
              </Card>
            ))}
            <Stack direction="row" spacing={1}>
              {["paragraph", "heading", "button"].map((type) => (
                <Button
                  key={type}
                  onClick={() =>
                    setContent({
                      ...content,
                      blocks: [
                        ...content.blocks,
                        type === "button"
                          ? {
                              type: "button",
                              text: "Discover",
                              url: company?.siteUrl || "https://example.com",
                            }
                          : { type: type as "paragraph" | "heading", text: "" },
                      ],
                    })
                  }
                >
                  Add {type}
                </Button>
              ))}
            </Stack>
            <TextField
              select
              label="Add media image"
              value=""
              onChange={(e) => {
                const asset = media.find((item) => item.id === e.target.value);
                if (asset)
                  setContent({
                    ...content,
                    blocks: [
                      { type: "image", url: asset.url, alt: asset.alt || "Atelier collection" },
                      ...content.blocks,
                    ],
                  });
              }}
            >
              {media.map((asset) => (
                <MenuItem key={asset.id} value={asset.id}>
                  {asset.alt || asset.id}
                </MenuItem>
              ))}
            </TextField>
            <Card>
              <CardContent>
                <Typography variant="h6">AI drafting</Typography>
                <Typography variant="body2">Do not include customer names, email addresses or other personal data in drafting requests.</Typography>
                {history.map((entry, i) => (
                  <Typography key={i} sx={{ whiteSpace: "pre-wrap", my: 1 }}>
                    {entry.role}: {entry.text}
                  </Typography>
                ))}
                <TextField
                  fullWidth
                  multiline
                  label="Describe the newsletter"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                />
                <Button
                  disabled={busy || !message.trim()}
                  onClick={() =>
                    void run(async () => {
                      const result = await invoke<{ reply: string; content: EmailContent }>(
                        "chatDraftEmail",
                        { message, history: history.slice(-18) },
                      );
                      setHistory([
                        ...history.slice(-18),
                        { role: "user", text: message },
                        { role: "assistant", text: result.reply },
                      ]);
                      setContent(result.content);
                      setMessage("");
                    })
                  }
                >
                  Draft with AI
                </Button>
              </CardContent>
            </Card>
            <Stack direction="row" spacing={1}>
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await save();
                    setNotice("Draft saved");
                  })
                }
              >
                Save draft
              </Button>
              <Button
                onClick={() => {
                  setId(undefined);
                  setRevision(0);
                  setContent(initial);
                  setHistory([]);
                }}
              >
                New draft
              </Button>
            </Stack>
            <TextField
              label="Approved test recipient"
              value={testTo}
              onChange={(e) => setTestTo(e.target.value)}
            />
            <Button
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  await invoke("testEmailCampaign", { content, to: testTo });
                  setNotice("Test queued; inspect Delivery health");
                })
              }
            >
              Send test
            </Button>
            <TextField
              type="datetime-local"
              label="Schedule (your local time)"
              slotProps={{ inputLabel: { shrink: true } }}
              value={schedule}
              onChange={(e) => setSchedule(e.target.value)}
            />
            <Button
              variant="contained"
              disabled={busy || settings.marketingPaused}
              onClick={() =>
                void run(async () => {
                  if (schedule) emailScheduleIso(schedule);
                  const result = await invoke<{ confirmed: number }>("emailAudienceSummary", {});
                  setAudienceCount(result.confirmed);
                  setConfirm(true);
                })
              }
            >
              Review {schedule ? "scheduled send" : "send now"}
            </Button>
          </Stack>
          <div className="email-preview">
            <Typography variant="h6">Email preview</Typography>
            <iframe title="Branded email preview" sandbox="" srcDoc={preview} />
            <details>
              <summary>Plain-text alternative</summary>
              <pre style={{ whiteSpace: "pre-wrap" }}>{previewText}</pre>
            </details>
          </div>
        </div>
      )}
      {tab > 0 && tab < 4 && (
        <Stack spacing={2}>
          {tab === 1 && (
            <>
              <TextField
                select
                label="Subscription status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {["", "pending", "confirmed", "unsubscribed", "not_subscribed"].map((status) => (
                  <MenuItem key={status} value={status}>
                    {status || "All statuses"}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                label="Find exact email address"
                value={searchEmail}
                onChange={(e) => setSearchEmail(e.target.value)}
              />
              <Button disabled={busy} onClick={() => void run(() => load("contacts"))}>
                Search / filter
              </Button>
              <Button component="label" disabled={busy}>
                Preview consent-backed CSV import
                <input
                  type="file"
                  hidden
                  accept=".csv,text/csv"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    void run(async () => {
                      const [header, ...records] = parseCsv(await file.text());
                      if (header?.join(",") !== "email,consentAt,evidence")
                        throw new Error(
                          "Required CSV columns: email,consentAt,evidence. Maximum 100 rows; timestamp must be ISO format.",
                        );
                      const entries = records.map(([email, consentAt, evidence]) => ({
                        email,
                        consentAt,
                        evidence,
                      }));
                      const result = await invoke<{ eligible: number }>("importEmailContacts", {
                        dryRun: true,
                        entries,
                      });
                      setImportEntries(entries);
                      setImportCount(result.eligible);
                    });
                    e.target.value = "";
                  }}
                />
              </Button>
              <TextField
                label="Invite newsletter subscriber"
                type="email"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
              <Button
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await invoke("inviteEmailContact", { email: address });
                    setNotice(
                      "Confirmation invitation requested. No address is subscribed without confirmation.",
                    );
                    await load("contacts");
                  })
                }
              >
                Send confirmation invitation
              </Button>
              <Button
                onClick={() => {
                  const csv = [
                    "email,status,source",
                    ...rows.map((row) =>
                      [row.email ?? "", row.status ?? "", row.source ?? ""].map(csvCell).join(","),
                    ),
                  ].join("\r\n");
                  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
                  const link = document.createElement("a");
                  link.href = url;
                  link.download = "newsletter-loaded-contacts.csv";
                  link.click();
                  URL.revokeObjectURL(url);
                  trackEvent("email_contacts_export", { count: rows.length });
                }}
              >
                Export loaded contacts as CSV
              </Button>
            </>
          )}
          {rows.map((row) => (
            <Card key={row.id}>
              <CardContent>
                <Typography>{row.email || row.content?.subject || row.id}</Typography>
                <Typography variant="body2">
                  {row.status} {row.source} {row.kind}{" "}
                  {row.suppression ? `— suppressed: ${row.suppression}` : ""}
                </Typography>
                {row.approximateOpens !== undefined && (
                  <Typography variant="body2">
                    Approximate opens: {row.approximateOpens} (image proxies and blocking affect
                    counts)
                  </Typography>
                )}
                {row.error && <Alert severity="warning">{row.error}</Alert>}
                {tab === 1 && (
                  <Button
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await invoke("unsubscribeEmailContact", { contactId: row.id });
                        await load("contacts");
                      })
                    }
                  >
                    Unsubscribe
                  </Button>
                )}
                {tab === 1 && (
                  <>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const data = await invoke("exportEmailContact", { contactId: row.id });
                          const url = URL.createObjectURL(
                            new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
                          );
                          const link = document.createElement("a");
                          link.href = url;
                          link.download = `newsletter-contact-${row.id}.json`;
                          link.click();
                          URL.revokeObjectURL(url);
                        })
                      }
                    >
                      Export contact and consent evidence
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const preview = await invoke<{
                            retained: string;
                            deliveryRecordsToReview: number;
                          }>("redactEmailContact", { contactId: row.id, dryRun: true });
                          setRedaction({
                            id: row.id,
                            retained: preview.retained,
                            count: preview.deliveryRecordsToReview,
                          });
                        })
                      }
                    >
                      Review newsletter redaction
                    </Button>
                  </>
                )}
                {tab === 2 && (
                  <Stack direction="row">
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const stats = await invoke<Record<string, number>>("emailCampaignStats", {
                            id: row.id,
                          });
                          setNotice(
                            Object.entries(stats)
                              .map(([key, count]) => `${key}: ${count}`)
                              .join(" · "),
                          );
                        })
                      }
                    >
                      Delivery counts
                    </Button>
                    <Button
                      onClick={() => {
                        setId(row.status === "draft" ? row.id : undefined);
                        setRevision(row.status === "draft" ? (row.revision ?? 0) : 0);
                        if (row.content) setContent(row.content);
                        setHistory(row.history ?? []);
                        setTab(0);
                      }}
                    >
                      Edit / duplicate
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          await invoke("cancelEmailCampaign", { id: row.id });
                          await load("campaigns");
                        })
                      }
                    >
                      Cancel unsent deliveries
                    </Button>
                    <Button
                      disabled={busy}
                      onClick={() =>
                        void run(async () => {
                          const result = await invoke<{ retried: number }>(
                            "retryRejectedEmailCampaign",
                            { id: row.id },
                          );
                          setNotice(
                            `${result.retried} rejected submissions requeued. Accepted, bounced and ambiguous deliveries were not retried.`,
                          );
                        })
                      }
                    >
                      Retry rejected submissions only
                    </Button>
                  </Stack>
                )}
              </CardContent>
            </Card>
          ))}
          {cursor && (
            <Button
              disabled={busy}
              onClick={() =>
                void run(() =>
                  load(tab === 1 ? "contacts" : tab === 2 ? "campaigns" : "deliveries", cursor),
                )
              }
            >
              Load more
            </Button>
          )}
        </Stack>
      )}
      {tab === 4 && (
        <Stack spacing={2}>
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.marketingPaused}
                onChange={(e) => setSettings({ ...settings, marketingPaused: e.target.checked })}
              />
            }
            label="Pause all marketing sends"
          />
          <TextField
            label="Sender display name"
            value={settings.senderName}
            onChange={(e) => setSettings({ ...settings, senderName: e.target.value })}
          />
          <TextField
            label="Reply-to"
            value={settings.replyTo}
            onChange={(e) => setSettings({ ...settings, replyTo: e.target.value })}
          />
          <TextField
            label="Logo HTTPS URL"
            value={settings.logoUrl}
            onChange={(e) => setSettings({ ...settings, logoUrl: e.target.value })}
          />
          <TextField
            label="Accent color"
            value={settings.accent}
            onChange={(e) => setSettings({ ...settings, accent: e.target.value })}
          />
          <TextField
            label="Approved test addresses (comma separated)"
            value={settings.testRecipients.join(",")}
            onBlur={() =>
              setSettings({ ...settings, testRecipients: settings.testRecipients.filter(Boolean) })
            }
            onChange={(e) =>
              setSettings({
                ...settings,
                testRecipients: e.target.value.split(",").map((value) => value.trim()),
              })
            }
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={settings.openTrackingEnabled}
                onChange={(e) =>
                  setSettings({ ...settings, openTrackingEnabled: e.target.checked })
                }
              />
            }
            label="Allow optional aggregate open measurement for separately consented subscribers"
          />
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await invoke("saveEmailSettings", settings);
                setNotice("Email settings saved");
              })
            }
          >
            Save email settings
          </Button>
        </Stack>
      )}
      <Dialog open={!!redaction} onClose={() => setRedaction(undefined)}>
        <DialogTitle>Redact newsletter data?</DialogTitle>
        <DialogContent>
          <Typography>
            This removes the newsletter address/profile, revokes its preference tokens, and redacts
            non-transactional delivery bodies. This action cannot be undone. {redaction?.count}{" "}
            delivery records will be reviewed.
          </Typography>
          <Typography>{redaction?.retained}</Typography>
          <Typography>
            This is not a complete order/accounting/Heritage erasure request. Review any wider legal
            request separately.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRedaction(undefined)}>Cancel</Button>
          <Button
            color="error"
            disabled={busy}
            onClick={() =>
              void run(async () => {
                if (!redaction) return;
                await invoke("redactEmailContact", {
                  contactId: redaction.id,
                  dryRun: false,
                  confirmation: "REDACT NEWSLETTER DATA",
                });
                setRedaction(undefined);
                await load("contacts");
                setNotice("Newsletter data redacted; retained legal records were not changed.");
              })
            }
          >
            Permanently redact newsletter data
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={importEntries.length > 0} onClose={() => setImportEntries([])}>
        <DialogTitle>Confirm evidence-backed import</DialogTitle>
        <DialogContent>
          <Typography>
            {importCount} new contacts can be imported. Existing contacts and withdrawals are never
            overwritten. You attest that each evidence record demonstrates prior newsletter consent.
            No open measurement permission is imported.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setImportEntries([])}>Cancel</Button>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                await invoke("importEmailContacts", { entries: importEntries, dryRun: false });
                setImportEntries([]);
                await load("contacts");
                setNotice("Import completed");
              })
            }
          >
            Confirm consent evidence and import
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog open={confirm} onClose={() => setConfirm(false)}>
        <DialogTitle>Approve campaign revision</DialogTitle>
        <DialogContent>
          <Typography>Subject: {content.subject}</Typography>
          <Typography>
            Audience: {audienceCount ?? "…"} confirmed subscribers before suppression checks.
            Consent is checked again before sending.
          </Typography>
          <Typography>
            Time:{" "}
            {schedule ? new Date(schedule).toLocaleString() : "Next scheduled processing cycle"}.
            Zone: {Intl.DateTimeFormat().resolvedOptions().timeZone}.{" "}
            {schedule && Number.isFinite(new Date(schedule).getTime())
              ? `UTC: ${new Date(schedule).toISOString()}.`
              : ""}{" "}
            Accepted messages cannot be recalled.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(false)}>Back</Button>
          <Button
            disabled={busy}
            onClick={() =>
              void run(async () => {
                const saved = await save();
                await invoke("scheduleEmailCampaign", {
                  ...saved,
                  scheduledAt: schedule ? emailScheduleIso(schedule) : new Date().toISOString(),
                  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                });
                setConfirm(false);
                setNotice("Campaign scheduled");
                setId(undefined);
                setRevision(0);
                trackEvent("email_campaign_scheduled");
              })
            }
          >
            Approve and schedule
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
