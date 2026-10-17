import type { ReactNode } from "react";
import {
  AppBar,
  BottomNavigation,
  BottomNavigationAction,
  Box,
  IconButton,
  Toolbar,
  Typography,
} from "@mui/material";
import {
  AutoFixHigh,
  Campaign,
  Inventory2,
  LocalShipping,
  Logout,
  Psychology,
  Settings,
} from "@mui/icons-material";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { trackEvent } from "../../lib/analytics";
import "./AppShell.scss";

export type Section =
  | "canvas"
  | "products"
  | "campaigns"
  | "orders"
  | "strategy"
  | "settings";

const NAV: { key: Section; label: string; icon: ReactNode }[] = [
  { key: "canvas", label: "Canvas", icon: <AutoFixHigh /> },
  { key: "products", label: "Products", icon: <Inventory2 /> },
  { key: "campaigns", label: "Campaigns", icon: <Campaign /> },
  { key: "orders", label: "Orders", icon: <LocalShipping /> },
  { key: "strategy", label: "Strategy", icon: <Psychology /> },
  { key: "settings", label: "Settings", icon: <Settings /> },
];

const TITLES: Record<Section, string> = {
  canvas: "Storefront Canvas",
  products: "Products",
  campaigns: "Campaigns",
  orders: "Fulfillment",
  strategy: "Strategy",
  settings: "Settings",
};

/** Lifecycle: beta — mobile-first shell with bottom navigation. */
export function AppShell({
  section,
  onNavigate,
  children,
}: {
  section: Section;
  onNavigate: (s: Section) => void;
  children: ReactNode;
}) {
  return (
    <Box className="app-shell">
      <AppBar position="sticky" color="transparent" elevation={0}>
        <Toolbar>
          <Typography variant="h6" flex={1}>
            {TITLES[section]}
          </Typography>
          <IconButton aria-label="sign out" onClick={() => signOut(auth)}>
            <Logout />
          </IconButton>
        </Toolbar>
      </AppBar>
      <Box className="app-shell-content">{children}</Box>
      <BottomNavigation
        className="app-shell-nav"
        value={section}
        onChange={(_, s: Section) => {
          trackEvent("admin_navigate", { section: s });
          onNavigate(s);
        }}
        showLabels
      >
        {NAV.map((n) => (
          <BottomNavigationAction
            key={n.key}
            value={n.key}
            label={n.label}
            icon={n.icon}
          />
        ))}
      </BottomNavigation>
    </Box>
  );
}
