import { useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { CampaignsTab } from "./CampaignsTab";
import { EmailTab } from "./EmailTab";
import { SocialTab } from "./SocialTab";
import "./MarketingScreen.scss";

const TABS = ["Campaigns", "Email", "Social"] as const;

/** Lifecycle: beta — marketing hub: promotional pricing now, email and social next. */
export function MarketingScreen() {
  const [tab, setTab] = useState(0);

  return (
    <Box className="marketing">
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
        {tab === 0 && <CampaignsTab />}
        {tab === 1 && <EmailTab />}
        {tab === 2 && <SocialTab />}
      </Box>
    </Box>
  );
}
