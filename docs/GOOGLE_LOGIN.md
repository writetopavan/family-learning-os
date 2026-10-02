# Google login and child selection

Parents sign in through Supabase using Google, or an email link as a fallback. They then choose a child before entering that child's workspace. Children do not need separate Google accounts. Returning authenticated users also see the chooser. Child selection is workspace context, not a change of identity or permissions: API requests retain the parent's Supabase JWT and existing family RLS policies.

## Enable Google login for the current deployment

The Supabase project is `dtjioyzffclsayqdxjei` (`familylearningos`). Google sign-in was disabled when this change was prepared. No Google client secret belongs in GitHub or browser environment variables.

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview?project=family-learning-os-dev) in the existing `family-learning-os-dev` project. Configure the app name, support email, audience, and developer contact. Use External audience for parents outside your organization. While the app is in Testing, add the Google accounts that should be able to sign in as test users.
2. Configure only the basic identity scopes: `openid`, `userinfo.email`, and `userinfo.profile`. No Gmail mailbox permissions are needed.
3. Create an OAuth client with type **Web application**. Add this authorized JavaScript origin:
   - `https://family-learning-os-mocha.vercel.app`
   - For local development only: `http://localhost:3000`
4. Add this exact **authorized redirect URI** in Google:
   - `https://dtjioyzffclsayqdxjei.supabase.co/auth/v1/callback`
5. Open [Supabase Auth providers](https://supabase.com/dashboard/project/dtjioyzffclsayqdxjei/auth/providers). Enable Google, paste the Google client ID and client secret, and save. Keep nonce checking enabled.
6. In [Supabase Auth URL configuration](https://supabase.com/dashboard/project/dtjioyzffclsayqdxjei/auth/url-configuration), set the Site URL to `https://family-learning-os-mocha.vercel.app`, and allow:
   - `https://family-learning-os-mocha.vercel.app/auth/callback`
   - `https://family-learning-os-mocha.vercel.app/dashboard` (keeps previously issued email links working)
   - For local development only: `http://localhost:3000/auth/callback`
7. If testing a Vercel preview, add that preview's exact `/auth/callback` URL to Supabase's allowlist. Add its origin in Google if needed; Google's redirect URI remains the Supabase URL above. Avoid broad production redirect wildcards.

Google and Supabase have different callbacks. Google returns to Supabase's `/auth/v1/callback`; Supabase returns to the app's `/auth/callback`.

## Existing accounts

Use the same verified email address as the current email-link account. Supabase supports automatic identity linking for matching verified emails; the existing Supabase user ID and family memberships should be preserved. Choosing a different Google email creates a different account unless an explicit account-linking flow is implemented. This change does not merge families or accounts in application code.

## Flow and errors

- The browser client uses its existing PKCE configuration and performs the authorization-code exchange automatically. The callback waits for the session before opening `/dashboard`.
- Cancelled authorization and expired links show a retry link, and callback error parameters are removed from the URL.
- Unauthenticated dashboard visits return to sign-in before family API calls.
- No child is automatically selected. Parents can choose a child, add/manage children, or switch families.
- Switching children remounts the learning workspace, clearing tutor messages, test answers, and curriculum selections from the previous child.
- An empty family has an Add a child action. A new account first creates a family.

## Live acceptance check after configuration and deployment

1. Sign out. Click Continue with Google and complete authorization with the existing parent's email.
2. Verify the existing family and children appear, with no duplicate family created.
3. Choose each child in turn. Confirm tutor, documents, tests and setup load for the selected child.
4. Return to Choose child; verify switching children clears the previous child's open conversation and test form.
5. Refresh `/dashboard`; verify the chooser appears again with the session retained.
6. Cancel Google authorization; verify the retry screen. Test the email-link fallback.
7. Sign out and open `/dashboard` directly; verify redirect to sign-in.

References: [Supabase Google sign-in](https://supabase.com/docs/guides/auth/social-login/auth-google), [identity linking](https://supabase.com/docs/guides/auth/auth-identity-linking), [redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

## Automated regression checks

From `apps/web`, run `npm ci`, `npx playwright install chromium`, then `npm run test:e2e`. The test server uses placeholder Supabase/API values and tests mock authorization and family API responses; no real Google account, API key, or family data is used. Tests cover PKCE callback exchange, cancellation/expired links, unauthenticated redirects, email fallback, disabled-provider behavior, child selection/refresh, clearing tutor drafts on child changes, switching families, and empty-family setup. The `Web authentication` GitHub Actions workflow runs the build and these checks for web pull requests. A successful mock flow does not replace the live acceptance check above.
