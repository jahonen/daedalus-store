import { useState } from "react";
import { Box, Tab, Tabs } from "@mui/material";
import { OrdersTab } from "./OrdersTab";
import { RepairsTab } from "./RepairsTab";
import { CustomerServiceTab } from "./CustomerServiceTab";
import "./FulfillmentScreen.scss";

const TABS = ["Orders", "Repairs", "Customer Service"] as const;

/** Lifecycle: beta — fulfilment hub with orders, repairs, and customer service. */
export function FulfillmentScreen() {
  const [tab, setTab] = useState(0);

  return (
    <Box className="fulfillment">
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
        {tab === 0 && <OrdersTab />}
        {tab === 1 && <RepairsTab />}
        {tab === 2 && <CustomerServiceTab />}
      </Box>
    </Box>
  );
}
