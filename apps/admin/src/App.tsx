import { useState } from "react";
import { AuthGate } from "./auth/AuthGate";
import { AppShell, type Section } from "./components/AppShell/AppShell";
import { SnackbarProvider } from "./lib/useSnackbar";
import { CanvasScreen } from "./screens/Canvas/CanvasScreen";
import { ProductsScreen } from "./screens/Products/ProductsScreen";
import { CampaignsScreen } from "./screens/Campaigns/CampaignsScreen";
import { FulfillmentScreen } from "./screens/Fulfillment/FulfillmentScreen";
import { StrategyScreen } from "./screens/Strategy/StrategyScreen";
import { SettingsScreen } from "./screens/Settings/SettingsScreen";

const SCREENS: Record<Section, () => React.JSX.Element | null> = {
  canvas: CanvasScreen,
  products: ProductsScreen,
  campaigns: CampaignsScreen,
  orders: FulfillmentScreen,
  strategy: StrategyScreen,
  settings: SettingsScreen,
};

export function App() {
  const [section, setSection] = useState<Section>("canvas");
  const Screen = SCREENS[section];
  return (
    <SnackbarProvider>
      <AuthGate>
        <AppShell section={section} onNavigate={setSection}>
          <Screen />
        </AppShell>
      </AuthGate>
    </SnackbarProvider>
  );
}
