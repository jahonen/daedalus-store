import { Box, Card, CardContent, Typography } from "@mui/material";

/**
 * Lifecycle: alpha — placeholder for social publishing. Bluesky credentials
 * are captured under Settings → Integrations; post scheduling/publishing
 * lands here.
 */
export function SocialTab() {
  return (
    <Box className="marketing-social">
      <Card className="empty-card">
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Social publishing
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Connect your Bluesky account under Settings → Integrations.
            Scheduling and publishing generated social posts will be built
            here.
          </Typography>
        </CardContent>
      </Card>
    </Box>
  );
}
