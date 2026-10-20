import { useEffect, useState } from "react";
import { httpsCallable } from "firebase/functions";
import {
  Box,
  Button,
  Drawer,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import type { Artisan } from "@daedalus/shared";
import { fns } from "../../lib/firebase";
import { useAsyncAction } from "../../lib/useAsyncAction";

type Listed = Artisan & { id: string };

const listArtisans = httpsCallable<Record<string, never>, { artisans: Listed[] }>(fns, "listArtisans");
const saveArtisan = httpsCallable<
  { name: string; bio?: string; specialties?: string[]; location?: string },
  { id: string }
>(fns, "saveArtisan");

interface Props {
  value: string | undefined;
  onChange: (id: string | undefined) => void;
}

/** Artisan dropdown with inline "create new" drawer. */
export function ArtisanPicker({ value, onChange }: Props) {
  const [artisans, setArtisans] = useState<Listed[]>([]);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [bio, setBio] = useState("");
  const [location, setLocation] = useState("");
  const [execute, busy] = useAsyncAction();

  useEffect(() => {
    listArtisans({}).then((r) => setArtisans(r.data.artisans)).catch(console.error);
  }, []);

  async function handleCreate() {
    if (!name.trim()) return;
    await execute(async () => {
      const res = await saveArtisan({
        name: name.trim(),
        bio: bio.trim(),
        location: location.trim(),
      });
      onChange(res.data.id);
      setCreating(false);
      setName("");
      setBio("");
      setLocation("");
      // Refresh list
      const r = await listArtisans({});
      setArtisans(r.data.artisans);
    });
  }

  return (
    <>
      <Box display="flex" gap={1} alignItems="center">
        <TextField
          select
          label="Artisan"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
          sx={{ flex: 1 }}
          size="small"
        >
          <MenuItem value="">None</MenuItem>
          {artisans.map((a) => (
            <MenuItem key={a.id} value={a.id}>
              {a.name}{a.location ? ` — ${a.location}` : ""}
            </MenuItem>
          ))}
        </TextField>
        <Button size="small" variant="outlined" onClick={() => setCreating(true)}>
          New
        </Button>
      </Box>

      <Drawer anchor="bottom" open={creating} onClose={() => setCreating(false)}>
        <Box p={3} pb={4}>
          <Typography variant="h6" mb={2}>New artisan</Typography>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} />
            <TextField label="Location" placeholder="Helsinki, Finland" value={location}
              onChange={(e) => setLocation(e.target.value)} />
            <TextField label="Bio" multiline minRows={2} value={bio}
              onChange={(e) => setBio(e.target.value)} />
            <Button variant="contained" disabled={busy || !name.trim()} onClick={handleCreate}>
              {busy ? "Creating…" : "Create"}
            </Button>
          </Box>
        </Box>
      </Drawer>
    </>
  );
}
