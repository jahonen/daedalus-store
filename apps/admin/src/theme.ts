import { createTheme } from "@mui/material/styles";

/**
 * iOS-like Material theme (spec §4):
 * 20px global radius, zero-border tonal separation, spring-like motion,
 * bottom sheets, 48px touch targets.
 */
const SPRING = "cubic-bezier(0.32, 0.72, 0, 1)";

export const theme = createTheme({
  shape: { borderRadius: 20 },
  palette: {
    mode: "light",
    background: { default: "#f5f5f7", paper: "#ffffff" },
    primary: { main: "#007aff" }, // iOS system blue
    secondary: { main: "#5856d6" },
    success: { main: "#34c759" },
    warning: { main: "#ff9500" },
    error: { main: "#ff3b30" },
    divider: "rgba(60, 60, 67, 0.08)",
    text: { primary: "#1c1c1e", secondary: "#6e6e73" },
  },
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", Roboto, sans-serif',
    h5: { fontWeight: 700, letterSpacing: "-0.02em" },
    h6: { fontWeight: 700, letterSpacing: "-0.01em" },
    button: { textTransform: "none", fontWeight: 600 },
  },
  transitions: { easing: { easeOut: SPRING, sharp: SPRING } },
  components: {
    MuiCssBaseline: {
      styleOverrides: { body: { backgroundColor: "#f5f5f7" } },
    },
    MuiPaper: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { backgroundImage: "none", border: "none" },
      },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: {
        root: { borderRadius: 20, border: "none" },
      },
    },
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: {
        root: { borderRadius: 14, minHeight: 48, paddingInline: 20 },
      },
    },
    MuiIconButton: {
      styleOverrides: { root: { minWidth: 48, minHeight: 48 } },
    },
    MuiListItemButton: {
      styleOverrides: { root: { borderRadius: 14, minHeight: 48 } },
    },
    MuiBottomNavigation: {
      styleOverrides: {
        root: {
          height: 64,
          borderTop: "none",
          backgroundColor: "rgba(255,255,255,0.92)",
          backdropFilter: "blur(20px)",
        },
      },
    },
    MuiBottomNavigationAction: {
      styleOverrides: { root: { minWidth: 48 } },
    },
    MuiDialog: {
      styleOverrides: {
        paper: { borderRadius: 20 },
      },
    },
    MuiDrawer: {
      styleOverrides: {
        paperAnchorBottom: {
          borderRadius: "20px 20px 0 0", // iOS bottom sheet
        },
      },
    },
    MuiTextField: {
      defaultProps: { variant: "filled" },
      styleOverrides: {
        root: {
          "& .MuiFilledInput-root": {
            borderRadius: 14,
            backgroundColor: "rgba(118,118,128,0.08)",
            "&:before, &:after": { display: "none" },
          },
        },
      },
    },
    MuiChip: {
      styleOverrides: { root: { borderRadius: 10, fontWeight: 600 } },
    },
    MuiFab: {
      styleOverrides: { root: { borderRadius: 18 } },
    },
  },
});
