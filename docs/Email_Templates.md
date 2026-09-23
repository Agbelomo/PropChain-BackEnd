# Email Templates Documentation

This document provides an overview of all email templates used in the PropChain system, including sample payloads, variable references, and preview examples.

## Available Email Templates

### 1. Password Reset Template

**Template File**: `src/email/templates/password-reset.ejs`

**Purpose**: Sent when a user requests a password reset.

**Variables**:
- `resetUrl` - The password reset link containing the reset token

**Sample Payload**:
```json
{
  "resetUrl": "http://localhost:3000/reset-password?token=abc123xyz789"
}
```

**Rendered Preview**:
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #333;">Password Reset Request</h2>
  <p>You have requested to reset your password for your PropChain account.</p>
  <p>Please click the link below to reset your password:</p>
  <a href="http://localhost:3000/reset-password?token=abc123xyz789" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
    Reset Password
  </a>
  <p>If you didn't request this password reset, please ignore this email.</p>
  <p>This link will expire in 1 hour for security reasons.</p>
  <p>Best regards,<br>The PropChain Team</p>
</div>
```

**Usage**:
```typescript
await emailService.sendPasswordResetEmail('user@example.com', 'abc123xyz789');
```

---

### 2. Account Locked Template

**Template File**: `src/email/templates/account-locked.ejs`

**Purpose**: Sent when a user's account is temporarily locked due to multiple failed login attempts.

**Variables**:
- `lockoutDuration` - Duration of the lockout in minutes

**Sample Payload**:
```json
{
  "lockoutDuration": 30
}
```

**Rendered Preview**:
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #d9534f;">Account Locked</h2>
  <p>Your PropChain account has been temporarily locked due to multiple failed login attempts.</p>
  <p>The lockout will automatically expire in 30 minutes.</p>
  <p>If you did not attempt to log in, please reset your password immediately or contact our support team.</p>
  <p>Best regards,<br>The PropChain Team</p>
</div>
```

**Usage**:
```typescript
await emailService.sendAccountLockedEmail('user@example.com', 30);
```

---

### 3. Fraud Alert Template

**Template File**: `src/email/templates/fraud-alert.ejs`

**Purpose**: Sent to administrators when suspicious fraud activity is detected.

**Variables**:
- `alertId` - Unique identifier for the fraud alert
- `pattern` - The fraud pattern detected (e.g., EXCESSIVE_FAILED_LOGINS)
- `severity` - Alert severity (LOW, MEDIUM, HIGH, CRITICAL)
- `userEmail` - Email of the user associated with the alert
- `description` - Detailed description of the suspicious activity

**Sample Payload**:
```json
{
  "alertId": "fraud-alert-123",
  "pattern": "EXCESSIVE_FAILED_LOGINS",
  "severity": "HIGH",
  "userEmail": "user@example.com",
  "description": "The account recorded 10 failed login attempts in the last 30 minutes."
}
```

**Rendered Preview**:
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #d9534f;">Fraud Alert Triggered</h2>
  <p><strong>Alert ID:</strong> fraud-alert-123</p>
  <p><strong>Pattern:</strong> EXCESSIVE_FAILED_LOGINS</p>
  <p><strong>Severity:</strong> HIGH</p>
  <p><strong>User:</strong> user@example.com</p>
  <p><strong>Summary:</strong> The account recorded 10 failed login attempts in the last 30 minutes.</p>
</div>
```

**Usage**:
```typescript
await emailService.sendFraudAlertEmail(['admin@example.com'], {
  alertId: 'fraud-alert-123',
  pattern: 'EXCESSIVE_FAILED_LOGINS',
  severity: 'HIGH',
  title: 'Repeated failed login attempts detected',
  description: 'The account recorded 10 failed login attempts in the last 30 minutes.',
  userEmail: 'user@example.com'
});
```

---

### 4. Transaction Status Change - Pending

**Template File**: `src/email/templates/transaction-status-pending.ejs`

**Purpose**: Sent when a transaction is created and set to pending status.

**Variables**:
- `transactionId` - Unique identifier for the transaction
- `propertyTitle` - Title of the property involved in the transaction
- `propertyAddress` - Address of the property
- `buyerName` - Name of the buyer
- `sellerName` - Name of the seller
- `amount` - Transaction amount
- `status` - Current transaction status

**Sample Payload**:
```json
{
  "transactionId": "txn-123",
  "propertyTitle": "Modern Downtown Apartment",
  "propertyAddress": "123 Main St, New York, NY 10001",
  "buyerName": "John Doe",
  "sellerName": "Jane Smith",
  "amount": "$500,000",
  "status": "PENDING"
}
```

**Rendered Preview**:
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #333;">Transaction Created</h2>
  <p>Your transaction has been successfully created and is now pending.</p>
  <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <p><strong>Transaction ID:</strong> txn-123</p>
    <p><strong>Property:</strong> Modern Downtown Apartment</p>
    <p><strong>Address:</strong> 123 Main St, New York, NY 10001</p>
    <p><strong>Amount:</strong> $500,000</p>
    <p><strong>Status:</strong> PENDING</p>
  </div>
  <p>You will receive notifications as the transaction progresses.</p>
  <p>Best regards,<br>The PropChain Team</p>
</div>
```

---

### 5. Transaction Status Change - Completed

**Template File**: `src/email/templates/transaction-status-completed.ejs`

**Purpose**: Sent when a transaction is successfully completed.

**Variables**:
- `transactionId` - Unique identifier for the transaction
- `propertyTitle` - Title of the property involved in the transaction
- `propertyAddress` - Address of the property
- `buyerName` - Name of the buyer
- `sellerName` - Name of the seller
- `amount` - Transaction amount
- `completionDate` - Date when transaction was completed
- `blockchainTxHash` - Blockchain transaction hash (if recorded)

**Sample Payload**:
```json
{
  "transactionId": "txn-123",
  "propertyTitle": "Modern Downtown Apartment",
  "propertyAddress": "123 Main St, New York, NY 10001",
  "buyerName": "John Doe",
  "sellerName": "Jane Smith",
  "amount": "$500,000",
  "completionDate": "January 15, 2026",
  "blockchainTxHash": "0xabc123...xyz789"
}
```

**Rendered Preview**:
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #28a745;">Transaction Completed</h2>
  <p>Congratulations! Your transaction has been successfully completed.</p>
  <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <p><strong>Transaction ID:</strong> txn-123</p>
    <p><strong>Property:</strong> Modern Downtown Apartment</p>
    <p><strong>Address:</strong> 123 Main St, New York, NY 10001</p>
    <p><strong>Amount:</strong> $500,000</p>
    <p><strong>Completion Date:</strong> January 15, 2026</p>
    <p><strong>Blockchain Hash:</strong> 0xabc123...xyz789</p>
  </div>
  <p>All documents and records have been updated. Thank you for using PropChain.</p>
  <p>Best regards,<br>The PropChain Team</p>
</div>
```

---

### 6. Transaction Status Change - Cancelled

**Template File**: `src/email/templates/transaction-status-cancelled.ejs`

**Purpose**: Sent when a transaction is cancelled.

**Variables**:
- `transactionId` - Unique identifier for the transaction
- `propertyTitle` - Title of the property involved in the transaction
- `propertyAddress` - Address of the property
- `buyerName` - Name of the buyer
- `sellerName` - Name of the seller
- `amount` - Transaction amount
- `cancellationReason` - Reason for cancellation (if provided)
- `cancelledDate` - Date when transaction was cancelled

**Sample Payload**:
```json
{
  "transactionId": "txn-123",
  "propertyTitle": "Modern Downtown Apartment",
  "propertyAddress": "123 Main St, New York, NY 10001",
  "buyerName": "John Doe",
  "sellerName": "Jane Smith",
  "amount": "$500,000",
  "cancellationReason": "Mutual agreement between parties",
  "cancelledDate": "January 10, 2026"
}
```

**Rendered Preview**:
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #d9534f;">Transaction Cancelled</h2>
  <p>Your transaction has been cancelled.</p>
  <div style="background-color: #f5f5f5; padding: 15px; border-radius: 5px; margin: 20px 0;">
    <p><strong>Transaction ID:</strong> txn-123</p>
    <p><strong>Property:</strong> Modern Downtown Apartment</p>
    <p><strong>Address:</strong> 123 Main St, New York, NY 10001</p>
    <p><strong>Amount:</strong> $500,000</p>
    <p><strong>Reason:</strong> Mutual agreement between parties</p>
    <p><strong>Cancelled Date:</strong> January 10, 2026</p>
  </div>
  <p>If you have any questions about this cancellation, please contact our support team.</p>
  <p>Best regards,<br>The PropChain Team</p>
</div>
```

---

## Email Service API

### sendPasswordResetEmail

```typescript
async sendPasswordResetEmail(email: string, resetToken: string): Promise<void>
```

Sends a password reset email to the specified user.

**Parameters**:
- `email` - User's email address
- `resetToken` - Password reset token

---

### sendAccountLockedEmail

```typescript
async sendAccountLockedEmail(email: string, lockoutDuration: number): Promise<void>
```

Sends an account locked notification email.

**Parameters**:
- `email` - User's email address
- `lockoutDuration` - Lockout duration in minutes

---

### sendFraudAlertEmail

```typescript
async sendFraudAlertEmail(recipients: string[], payload: FraudAlertEmailPayload): Promise<void>
```

Sends fraud alert notifications to administrators.

**Parameters**:
- `recipients` - Array of admin email addresses
- `payload` - Fraud alert details

**FraudAlertEmailPayload Interface**:
```typescript
interface FraudAlertEmailPayload {
  alertId: string;
  pattern: string;
  severity: string;
  title: string;
  description: string;
  userEmail?: string | null;
}
```

---

### sendTransactionStatusEmail

```typescript
async sendTransactionStatusEmail(
  email: string,
  status: TransactionStatus,
  payload: TransactionStatusPayload
): Promise<void>
```

Sends transaction status change notifications.

**Parameters**:
- `email` - Recipient's email address
- `status` - Transaction status (PENDING, COMPLETED, CANCELLED)
- `payload` - Transaction details

**TransactionStatusPayload Interface**:
```typescript
interface TransactionStatusPayload {
  transactionId: string;
  propertyTitle: string;
  propertyAddress: string;
  buyerName: string;
  sellerName: string;
  amount: string;
  completionDate?: string;
  blockchainTxHash?: string;
  cancellationReason?: string;
  cancelledDate?: string;
}
```

---

## Template Preview Endpoint

For admin preview purposes, the following endpoint can be used to render email templates with sample data:

### GET /admin/email/preview/:templateName

**Description**: Renders a preview of the specified email template with sample data.

**Authentication**: Required (Admin only)

**Parameters**:
- `templateName` - Name of the template to preview (e.g., password-reset, account-locked, fraud-alert, transaction-status-pending, transaction-status-completed, transaction-status-cancelled)

**Response**: HTML rendered template

**Example Request**:
```bash
GET /admin/email/preview/password-reset
```

**Example Response**:
```html
<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #333;">Password Reset Request</h2>
  <p>You have requested to reset your password for your PropChain account.</p>
  <p>Please click the link below to reset your password:</p>
  <a href="http://localhost:3000/reset-password?token=sample-token-123" style="display: inline-block; padding: 10px 20px; background-color: #007bff; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0;">
    Reset Password
  </a>
  <p>If you didn't request this password reset, please ignore this email.</p>
  <p>This link will expire in 1 hour for security reasons.</p>
  <p>Best regards,<br>The PropChain Team</p>
</div>
```

---

## Testing Email Templates

### Unit Tests

Email templates should be tested with the following test cases:

1. **Variable Rendering**: Ensure all template variables are properly rendered
2. **Missing Variables**: Test behavior when optional variables are missing
3. **HTML Validation**: Ensure rendered HTML is valid
4. **Responsive Design**: Verify templates render correctly on mobile devices
5. **Link Functionality**: Test that all links in templates are functional

### Test Data

Use the following sample data for testing:

```typescript
const testEmailData = {
  passwordReset: {
    resetUrl: 'http://localhost:3000/reset-password?token=test-token-123'
  },
  accountLocked: {
    lockoutDuration: 30
  },
  fraudAlert: {
    alertId: 'test-alert-123',
    pattern: 'EXCESSIVE_FAILED_LOGINS',
    severity: 'HIGH',
    userEmail: 'test@example.com',
    description: 'Test fraud alert description'
  },
  transactionPending: {
    transactionId: 'txn-test-123',
    propertyTitle: 'Test Property',
    propertyAddress: '123 Test St, Test City, TC 12345',
    buyerName: 'Test Buyer',
    sellerName: 'Test Seller',
    amount: '$100,000',
    status: 'PENDING'
  },
  transactionCompleted: {
    transactionId: 'txn-test-123',
    propertyTitle: 'Test Property',
    propertyAddress: '123 Test St, Test City, TC 12345',
    buyerName: 'Test Buyer',
    sellerName: 'Test Seller',
    amount: '$100,000',
    completionDate: 'January 15, 2026',
    blockchainTxHash: '0xabc123...xyz789'
  },
  transactionCancelled: {
    transactionId: 'txn-test-123',
    propertyTitle: 'Test Property',
    propertyAddress: '123 Test St, Test City, TC 12345',
    buyerName: 'Test Buyer',
    sellerName: 'Test Seller',
    amount: '$100,000',
    cancellationReason: 'Test cancellation',
    cancelledDate: 'January 10, 2026'
  }
};
```

---

## Best Practices

1. **Keep Templates Simple**: Avoid complex logic in templates
2. **Use Inline CSS**: Email clients have limited CSS support
3. **Test Across Clients**: Test templates in Gmail, Outlook, Apple Mail, etc.
4. **Include Plain Text**: Always provide a plain text fallback
5. **Responsive Design**: Ensure templates work on mobile devices
6. **Accessibility**: Use semantic HTML and alt text for images
7. **Personalization**: Use recipient names when possible
8. **Clear Call-to-Action**: Make action buttons prominent and clear
9. **Brand Consistency**: Maintain consistent branding across all templates
10. **Legal Compliance**: Include required footer information (unsubscribe, privacy policy)

---

## Future Enhancements

- Add email template versioning
- Implement A/B testing for email templates
- Add support for multi-language templates
- Create template editor UI for admins
- Add email analytics tracking
- Implement template preview with custom data
