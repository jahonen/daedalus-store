import { useEffect, useState, type ReactNode } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, type User } from "firebase/auth";
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
  | { kind: "admin"; user: User };

async function getIsAdmin(user: User): Promise<boolean> {
  // Callable promotes @cvpe.dev accounts; rejected domains throw permission-denied.
  try {
    await ensureAdminRole({});
  } catch {
    return false;
  }
  // Force refresh so a just-promoted account picks up the custom claim.
  const token = await user.getIdTokenResult(true);
  return token.claims.admin === true;
}

/** Lifecycle: beta — gates the whole admin app on Google sign-in + admin claim. */
export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return setState({ kind: "signedOut" });
      if (await getIsAdmin(user)) return setState({ kind: "admin", user });
      setState({ kind: "denied", user });
    });
  }, []);

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
            signInWithPopup(auth, googleProvider);
          }}
        >
          Sign in with Google
        </Button>
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
          {state.user.email} isn't an admin. Only @cvpe.dev accounts are
          promoted automatically.
        </Typography>
        <Button onClick={() => signOut(auth)}>Sign out</Button>
      </Box>
    );
  }

  return <>{children}</>;
}
