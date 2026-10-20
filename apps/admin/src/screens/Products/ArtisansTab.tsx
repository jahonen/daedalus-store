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
import type { Artisan } from "@daedalus/shared";
import { fns } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import { useAsyncAction } from "../../lib/useAsyncAction";

type Listed = Artisan & { id: string };

const listArtisans = httpsCallable<Record<string, never>, { artisans: Listed[] }>(
  fns,
  "listArtisans",
);
const saveArtisan = httpsCallable<
  {
    id?: string;
    name: string;
    bio?: string;
    specialties?: string[];
    location?: string;
    status?: "active" | "archived";
  },
  { id: string }
>(fns, "saveArtisan");

/** Lifecycle: alpha — artisan registry: the designers/makers attributed on items. */
export function ArtisansTab() {
  const [artisans, setArtisans] = useState<Listed[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Listed | null>(null);
  const [creating, setCreating] = useState(false);
  const [execute, busy] = useAsyncAction();

  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [specialties, setSpecialties] = useState("");
  const [status, setStatus] = useState<"active" | "archived">("active");

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await listArtisans({});
      setArtisans(res.data.artisans);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setBio("");
    setLocation("");
    setSpecialties("");
    setStatus("active");
    setCreating(true);
  }

  function openEdit(a: Listed) {
    setEditing(a);
    setName(a.name);
    setBio(a.bio);
    setLocation(a.location);
    setSpecialties(a.specialties.join("\n"));
    setStatus(a.status);
    setCreating(true);
  }

  async function handleSave() {
    if (!name.trim()) return;
    trackEvent(editing ? "artisan_update" : "artisan_create", { id: editing?.id });
    await execute(async () => {
      await saveArtisan({
        id: editing?.id,
        name: name.trim(),
        bio: bio.trim(),
        location: location.trim(),
        specialties: specialties.split("\n").map((s) => s.trim()).filter(Boolean),
        status,
      });
      setCreating(false);
      await load();
    });
  }

  if (!artisans && !loadError) {
    return <Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>;
  }

  if (loadError) {
    return (
      <Box textAlign="center" p={4}>
        <Typography color="error" gutterBottom>Failed to load artisans</Typography>
        <Typography variant="body2" color="text.secondary" mb={2}>{loadError}</Typography>
        <Button variant="outlined" onClick={load}>Retry</Button>
      </Box>
    );
  }

  return (
    <Box>
      {artisans?.length === 0 && (
        <Typography color="text.secondary" textAlign="center" py={4}>
          No artisans yet. Artisans are the makers credited on items and shown on the storefront.
        </Typography>
      )}
      {artisans?.map((a) => (
        <Card key={a.id} className="order-card" sx={{ cursor: "pointer" }} onClick={() => openEdit(a)}>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1}>
              <Typography variant="h6" flex={1}>{a.name}</Typography>
              <Chip
                size="small"
                label={a.status}
                color={a.status === "active" ? "success" : "default"}
              />
            </Box>
            {a.location && (
              <Typography variant="body2" color="text.secondary">{a.location}</Typography>
            )}
            {a.specialties.length > 0 && (
              <Box display="flex" gap={0.5} mt={1} flexWrap="wrap">
                {a.specialties.map((s) => (
                  <Chip key={s} size="small" label={s} variant="outlined" />
                ))}
              </Box>
            )}
            {a.bio && (
              <Typography variant="body2" color="text.secondary" mt={1}>
                {a.bio.slice(0, 120)}{a.bio.length > 120 ? "…" : ""}
              </Typography>
            )}
          </CardContent>
        </Card>
      ))}

      <Button variant="contained" sx={{ mt: 2 }} onClick={openCreate}>
        New artisan
      </Button>

      <Drawer anchor="bottom" open={creating} onClose={() => setCreating(false)}>
        <Box p={3} pb={4}>
          <Typography variant="h6" mb={2}>
            {editing ? `Edit ${editing.name}` : "New artisan"}
          </Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Location" placeholder="Helsinki, Finland" value={location}
              onChange={(e) => setLocation(e.target.value)} />
            <TextField label="Bio" multiline minRows={3} value={bio}
              onChange={(e) => setBio(e.target.value)} />
            <TextField
              label="Specialties (one per line)"
              placeholder={"Lighting\nMetalwork"}
              multiline minRows={2} value={specialties}
              onChange={(e) => setSpecialties(e.target.value)}
            />
            <Box display="flex" gap={1}>
              {(["active", "archived"] as const).map((s) => (
                <Chip
                  key={s} label={s}
                  color={status === s ? "primary" : "default"}
                  onClick={() => setStatus(s)}
                />
              ))}
            </Box>
            <Button variant="contained" disabled={busy || !name.trim()} onClick={handleSave}>
              {busy ? "Saving…" : "Save"}
            </Button>
          </Box>
        </Box>
      </Drawer>
    </Box>
  );
}
