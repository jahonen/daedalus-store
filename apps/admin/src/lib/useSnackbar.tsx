import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";
import { Alert, Snackbar } from "@mui/material";

type Severity = "error" | "success" | "info" | "warning";

interface SnackbarCtx {
  showError: (msg: string) => void;
  showSuccess: (msg: string) => void;
  showInfo: (msg: string) => void;
}

const Ctx = createContext<SnackbarCtx>({
  showError: () => {},
  showSuccess: () => {},
  showInfo: () => {},
});

export function useSnackbar() {
  return useContext(Ctx);
}

/** Lifecycle: beta — global async error/success surface for admin screens. */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const [severity, setSeverity] = useState<Severity>("error");

  const show = useCallback((s: Severity, m: string) => {
    setMsg(m);
    setSeverity(s);
    setOpen(true);
  }, []);

  const value: SnackbarCtx = {
    showError: useCallback((m: string) => show("error", m), [show]),
    showSuccess: useCallback((m: string) => show("success", m), [show]),
    showInfo: useCallback((m: string) => show("info", m), [show]),
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <Snackbar
        open={open}
        autoHideDuration={5000}
        onClose={() => setOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert
          severity={severity}
          variant="filled"
          onClose={() => setOpen(false)}
          sx={{ width: "100%" }}
        >
          {msg}
        </Alert>
      </Snackbar>
    </Ctx.Provider>
  );
}
