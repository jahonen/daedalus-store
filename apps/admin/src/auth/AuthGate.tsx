import { useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { Box, Button, CircularProgress, Typography } from "@mui/material";
import { httpsCallable } from "firebase/functions";
import { auth, fns, googleProvider } from "../lib/firebase";
import { trackEvent } from "../lib/analytics";

const ensureAdminRole = httpsCallable<Record<string, never>, { admin: boolean }>(
  fns,
  "ensureAdminRole",
);

type State =
  | { kind: "loading" }
  | { kind: "signedOut" }
  | { kind: "denied"; user: User }
  | { kind: "error"; user: User; message: string }
  | { kind: "admin"; user: User };

async function checkAdmin(user: User): Promise<"admin" | "denied" | string> {
  try {
    await ensureAdminRole({});
  } catch (e) {
    // permission-denied = definitively not an admin.
    if (e instanceof FirebaseError && e.code === "functions/permission-denied") {
      return "denied";
    }
    // Everything else (network, 500, timeout) is transient.
    return e instanceof Error ? e.message : String(e);
  }
  const token = await user.getIdTokenResult(true);
  return token.claims.admin === true ? "admin" : "denied";
}

/** Lifecycle: beta — gates the whole admin app on Google sign-in + admin claim. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return setState({ kind: "signedOut" });
      const result = await checkAdmin(user);
      if (result === "admin") return setState({ kind: "admin", user });
      if (result === "denied") return setState({ kind: "denied", user });
      setState({ kind: "error", user, message: result });
    });
  }, []);

  async function retry() {
    if (state.kind !== "error") return;
    setState({ kind: "loading" });
    const result = await checkAdmin(state.user);
    if (result === "admin") return setState({ kind: "admin", user: state.user });
    if (result === "denied") return setState({ kind: "denied", user: state.user });
    setState({ kind: "error", user: state.user, message: result });
  }

  if (state.kind === "loading") {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" height="100vh">
        <CircularProgress />
      </Box>
    );
  }

  if (state.kind === "signedOut") {
    return (
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        height="100vh"
        gap={2}
      >
        <Typography variant="h5">Daedalus Admin</Typography>
        <Typography color="text.secondary">Sign in with your work account</Typography>
        <Button
          variant="contained"
          onClick={() => {
            trackEvent("admin_sign_in_attempt");
            signInWithPopup(auth, googleProvider).catch((e) => {
              // User closed popup or browser blocked it — not an error.
              if (e?.code !== "auth/popup-closed-by-user") {
                console.error("[Auth] sign-in failed:", e);
              }
            });
          }}
        >
          Sign in with Google
        </Button>
      </Box>
    );
  }

  if (state.kind === "error") {
    return (
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        height="100vh"
        gap={2}
        p={3}
        textAlign="center"
      >
        <Typography variant="h6">Something went wrong</Typography>
        <Typography color="text.secondary">
          Could not verify access. Please try again.
        </Typography>
        <Box display="flex" gap={2}>
          <Button variant="contained" onClick={retry}>
            Retry
          </Button>
          <Button onClick={() => signOut(auth)}>Sign out</Button>
        </Box>
      </Box>
    );
  }

  if (state.kind === "denied") {
    return (
      <Box
        display="flex"
        flexDirection="column"
        justifyContent="center"
        alignItems="center"
        height="100vh"
        gap={2}
        p={3}
        textAlign="center"
      >
        <Typography variant="h6">No admin access</Typography>
        <Typography color="text.secondary">
          {state.user.email} doesn't have access to this console.
        </Typography>
        <Button onClick={() => signOut(auth)}>Sign out</Button>
      </Box>
    );
  }

  return <>{children}</>;
}
