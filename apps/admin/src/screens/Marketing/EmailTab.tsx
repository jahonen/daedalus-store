import { EmailWorkspace } from "./email/EmailWorkspace";

/**
 * Lifecycle: alpha — placeholder for lifecycle/campaign email. Transactional
 * order email already runs through SendGrid in onOrderFulfilled; broadcast
 * email tooling lands here.
 */
export function EmailTab() {
  return <EmailWorkspace />;
}
