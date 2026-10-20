import { useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { CustomerProfilesTab } from "./CustomerProfilesTab";
import { MarketInsightsTab } from "./MarketInsightsTab";
import "./StrategyScreen.scss";

const TABS = ["Customer Profiles", "Market Insights"] as const;

/**
 * Lifecycle: beta — strategy hub feeding every generation prompt
 * (see loadGenerationContext in services/functions).
 */
export function StrategyScreen() {
  const [tab, setTab] = useState(0);

  return (
    <Box className="strategy">
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
        {tab === 0 && <CustomerProfilesTab />}
        {tab === 1 && <MarketInsightsTab />}
      </Box>
    </Box>
  );
}
