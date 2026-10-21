import "./options.js";

// Checkout & inventory
export { createCheckoutSession } from "./checkout/createCheckoutSession.js";
export { stripeWebhook } from "./checkout/stripeWebhook.js";
export { expireLocks } from "./checkout/expireLocks.js";

// Storefront generation
export { generateStorefront } from "./generation/generateStorefront.js";
export { chatEditBlock } from "./generation/chatEditBlock.js";
export { regenerateBlock } from "./generation/regenerateBlock.js";
export { generateProductImage } from "./generation/generateProductImage.js";
export { generateSocialImage } from "./generation/generateSocialImage.js";
export { onStorefrontPageWrite } from "./generation/generateSocialCard.js";
export { processFavicon } from "./generation/processFavicon.js";

// Revalidation triggers
export { onProductWrite } from "./triggers/onProductWrite.js";
export { onCampaignWrite } from "./triggers/onCampaignWrite.js";
export { onMediaWrite } from "./triggers/onMediaWrite.js";
export { onArtisanWrite } from "./triggers/onArtisanWrite.js";

// Settings
export { onSettingsWrite } from "./settings/onSettingsWrite.js";

// Email
export { onOrderCreate, onOrderFulfilled } from "./email/orderEmails.js";
export {
  subscribeNewsletter,
  newsletterAction,
  newsletterConfirmationDetails,
  newsletterOneClick,
  inviteEmailContact,
  importEmailContacts,
  unsubscribeEmailContact,
} from "./email/contacts.js";
export {
  deliverMarketingEmail,
  deliverTransactionalEmail,
  onEmailQueued,
  recoverEmailQueue,
} from "./email/outbox.js";
export { sendgridEvents } from "./email/providerEvents.js";
export { chatDraftEmail } from "./email/chatDraftEmail.js";
export { exportEmailContact, redactEmailContact } from "./email/privacy.js";
export {
  listEmailRecords,
  saveEmailSettings,
  emailAudienceSummary,
  emailCampaignStats,
} from "./email/admin.js";
export {
  saveEmailCampaign,
  testEmailCampaign,
  scheduleEmailCampaign,
  cancelEmailCampaign,
  retryRejectedEmailCampaign,
  prepareEmailCampaigns,
} from "./email/campaigns.js";

// Auth
export { ensureAdminRole } from "./auth/ensureAdminRole.js";

// Admin
export { listOrders, markOrderFulfilled } from "./adminops/orderAdmin.js";

// Heritage
export {
  registerSerial,
  transferOwnership,
  getHeritageRecord,
  listHeritageRecords,
} from "./heritage/heritageAdmin.js";
export {
  createRepairRecord,
  updateRepairRecord,
  listRepairRecords,
} from "./heritage/repairAdmin.js";
export { saveArtisan, listArtisans } from "./heritage/artisanAdmin.js";

// Social publishing
export { chatDraftPost } from "./social/chatDraftPost.js";
export { publishSocialPost, listSocialPosts } from "./social/socialAdmin.js";
