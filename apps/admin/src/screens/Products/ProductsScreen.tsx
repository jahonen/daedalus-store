import { useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { ItemsTab } from "./ItemsTab";
import { ArtisansTab } from "./ArtisansTab";
import "./ProductsScreen.scss";

const TABS = ["Items", "Artisans"] as const;

/** Lifecycle: beta — catalogue hub: items CRUD and artisan registry. */
export function ProductsScreen() {
  const [tab, setTab] = useState(0);

  return (
    <Box className="products">
      <Tabs
        value={tab}
        onChange={(_, v: number) => setTab(v)}
        variant="scrollable"
        scrollButtons="auto"
      >
        {TABS.map((t) => (
          <Tab key={t} label={t} />
        ))}
      </Tabs>
      <Box mt={2}>
        {tab === 0 && <ItemsTab />}
        {tab === 1 && <ArtisansTab />}
      </Box>
    </Box>
  );
}
