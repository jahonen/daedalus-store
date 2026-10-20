import { Box, Card, CardContent, Typography } from "@mui/material";

/**
 * Lifecycle: alpha — placeholder for lifecycle/campaign email. Transactional
 * order email already runs through SendGrid in onOrderFulfilled; broadcast
 * email tooling lands here.
 */
export function EmailTab() {
  return (
    <Box className="marketing-email">
      <Card className="empty-card">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Email marketing
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Transactional order confirmations already send automatically via
            SendGrid. Broadcast and lifecycle email — campaigns, win-backs,
            restock notices — will be built here.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
