## Why Gmail and Outlook are not working now

They are not broken because of your password. The current app does not actually connect Gmail or Outlook yet:

- Gmail and Outlook are shown as “Coming soon” in the Integrations page.
- The Settings page lets someone add a Gmail/Outlook mailbox row, but it only saves an email address with `pending_oauth`; it never opens Google/Microsoft sign-in.
- There is no real send function behind campaign approval. Approving a message only changes its database status; it does not send through Gmail or Outlook.
- The earlier SMTP/app-password approach was removed because it is unreliable and too technical. Gmail/Outlook should use “Sign in with Google/Microsoft”, not app passwords.

## What I will build

### 1. Replace placeholder Gmail/Outlook with real account connection

On the Integrations page, Gmail and Outlook will become first-class cards:

- “Connect Gmail” opens a simple Google sign-in flow.
- “Connect Outlook” opens a simple Microsoft sign-in flow.
- No SMTP, no app password, no secret/API key fields.
- The user only sees plain steps: choose provider, sign in, confirm, test.

The app will store each connected mailbox per signed-in app user and workspace.

### 2. Add secure OAuth callback routes

I will add callback routes so Google/Microsoft can return the user to the app after approval:

```text
/settings or /integrations
  -> Connect Gmail / Connect Outlook
  -> Google/Microsoft sign-in page
  -> App OAuth callback
  -> Mailbox saved as Ready
```

Tokens will be encrypted before storage, with refresh tokens supported so the mailbox keeps working later.

### 3. Add “send a test email” confirmation

Instead of emailing a “Link account” button before the account is connected, the app will confirm the connection after sign-in by sending a real test message:

- User connects Gmail/Outlook.
- App asks: “Send a test email to this address?”
- User can send to themselves or another address.
- App sends through the newly connected Gmail/Outlook account.
- If it succeeds, the mailbox is marked “Ready to send”.
- If it fails, the app shows a human explanation and a one-click reconnect option.

This is safer and faster than an email-link setup because the OAuth sign-in already proves ownership of the mailbox.

### 4. Make setup non-technical

I will remove technical language from the mailbox flow:

- Replace “OAuth”, “SMTP”, “pending_oauth”, “credentials”, “provider” with simple labels.
- Add guided empty states like “Choose the email account you want Kinetic to send from”.
- Add provider-specific help: Gmail, Outlook, business account notes, blocked permission explanations.
- Show statuses as:
  - Ready to send
  - Needs sign-in again
  - Test failed
  - Not connected yet

### 5. Add Gmail and Outlook sending functions

I will implement server functions for:

- Listing connected mailboxes.
- Starting Gmail/Outlook connection.
- Handling the OAuth return.
- Refreshing expired access tokens.
- Sending test emails.
- Sending approved campaign emails through the chosen mailbox.
- Disconnecting a mailbox.

Gmail will use the Gmail API. Outlook will use Microsoft Graph Mail API.

### 6. Wire campaign approval to real sending

In the campaign approval queue:

- “Approve” will still approve the draft.
- I will add “Send now” for approved email messages.
- Sending will require a connected Gmail/Outlook mailbox.
- The app will update message status only after the provider accepts the email.
- Failures will be stored with clear explanations instead of silently marking messages as sent.

### 7. Clean up Settings and Inbox

The current Settings mailbox form is misleading. I will replace it with a simpler connected-mailboxes section or redirect users to Integrations.

The Inbox page currently says replies will land there later. I will update it so it reflects the real mailbox connection state and does not promise functionality that is not yet wired.

### 8. Database updates

I will add the fields needed for real OAuth mailboxes:

- encrypted access token
- encrypted refresh token
- token expiry
- provider account id
- scopes granted
- last test status/error
- last successful test time

I will keep row-level security so each user can only access their own connected mailboxes/workspace data.

### 9. Required setup outside the app

To make true end-user Gmail/Outlook OAuth work, Google and Microsoft require app credentials:

- Google OAuth client ID/secret with Gmail send scope.
- Microsoft app client ID/secret with Mail.Send and offline access.

I will build the app-side flow and use secure runtime secrets for these values. If those secrets are not already configured, I will pause at implementation time and ask for them through the secure secrets flow.

### 10. Verification pass

After implementation I will check:

- Gmail/Outlook cards no longer show “Coming soon”.
- Clicking connect starts the correct sign-in flow.
- Callback routes handle success and error cases.
- Test email send returns a clear success/failure.
- Connected mailbox rows show the right status.
- Campaign “Send now” uses the connected mailbox and updates message status correctly.
- Existing API-key integrations still render and test as before.

## What I will not do

- I will not bring back app passwords or SMTP setup.
- I will not fake a successful connection by only saving an email address.
- I will not mark a campaign email as sent unless Gmail/Outlook accepts the send request.
- I will not use a “Link account” email as the main connection mechanism because OAuth sign-in is the correct secure confirmation for Gmail/Outlook.