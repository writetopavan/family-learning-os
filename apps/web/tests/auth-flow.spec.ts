import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const families = [
  { family_id: "family-a", role: "parent", families: { id: "family-a", name: "Singh Family" } },
  { family_id: "family-b", role: "parent", families: { id: "family-b", name: "Other Family" } },
];
const students = [
  { id: "advik", family_id: "family-a", display_name: "Advik", date_of_birth: null },
  { id: "shanvi", family_id: "family-a", display_name: "Shanvi", date_of_birth: null },
];
function session() {
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const token = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: "parent", exp, role: "authenticated" })).toString('base64url')}.test`;
  return { access_token: token, refresh_token: "test-refresh", expires_at: exp, expires_in: 3600,
    token_type: "bearer", user: { id: "parent", email: "parent@example.test", aud: "authenticated", app_metadata: {}, user_metadata: {} } };
}
async function authenticate(context: BrowserContext) {
  await context.addCookies([{ name: "sb-auth-auth-token", value: `base64-${Buffer.from(JSON.stringify(session())).toString('base64url')}`, domain: "localhost", path: "/" }]);
}
async function mockApi(page: Page, children = students) {
  await page.route("http://127.0.0.1:4100/**", async (route) => {
    expect(route.request().headers().authorization).toMatch(/^Bearer /);
    const path = new URL(route.request().url()).pathname;
    let data: unknown = [];
    if (path === "/v1/families") data = families;
    if (path === "/v1/families/family-a/students") data = children;
    if (path === "/v1/families/family-b/students") data = [{ id: "other", family_id: "family-b", display_name: "Other Child", date_of_birth: null }];
    await route.fulfill({ json: data });
  });
}

test("unauthenticated dashboard returns to sign-in without family API requests", async ({ page }) => {
  let requests = 0;
  await page.route("http://127.0.0.1:4100/**", (route) => { requests++; return route.fulfill({ json: [] }); });
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await expect(page).toHaveURL("http://localhost:3000/");
  expect(requests).toBe(0);
});

test("disabled Google keeps the email fallback usable", async ({ page }) => {
  await page.route("https://auth.example.test/auth/v1/settings", (route) => route.fulfill({ json: { external: { google: false } } }));
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("status")).toContainText("Google sign-in is not available yet");
  await expect(page.getByRole("button", { name: "Send sign-in link" })).toBeEnabled();
  await expect(page).toHaveURL("http://localhost:3000/");
});

test("Google OAuth uses PKCE and returns to the child chooser", async ({ page }) => {
  await mockApi(page);
  let exchanged = false;
  await page.route("https://auth.example.test/auth/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/settings")) return route.fulfill({ json: { external: { google: true } } });
    if (url.pathname.endsWith("/authorize")) {
      expect(url.searchParams.get("provider")).toBe("google");
      expect(url.searchParams.get("redirect_to")).toBe("http://localhost:3000/auth/callback");
      expect(url.searchParams.get("code_challenge_method")).toBe("s256");
      expect(url.searchParams.get("prompt")).toBe("select_account");
      return route.fulfill({ contentType: "text/html", body: "<h1>Mock Google authorization</h1>" });
    }
    if (url.pathname.endsWith("/token")) {
      expect(url.searchParams.get("grant_type")).toBe("pkce");
      const body = route.request().postDataJSON();
      expect(body.auth_code).toBe("test-code");
      expect(body.code_verifier).toBeTruthy();
      exchanged = true;
      return route.fulfill({ json: session() });
    }
    return route.fulfill({ json: {} });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.getByRole("heading", { name: "Mock Google authorization" })).toBeVisible();
  await page.goto("/auth/callback?code=test-code");
  await expect(page.getByRole("heading", { name: "Who is learning today?" })).toBeVisible();
  expect(exchanged).toBe(true);
  await expect(page).toHaveURL("http://localhost:3000/dashboard");
});

test("cancelled authorization removes error parameters and offers retry", async ({ page }) => {
  await page.goto("/auth/callback?error=access_denied&error_description=private-details");
  await expect(page.getByRole("status")).toContainText("cancelled or the link has expired");
  await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
  await expect(page).toHaveURL("http://localhost:3000/auth/callback");
  await expect(page.locator("body")).not.toContainText("private-details");
});

test("child selection, switching, and refresh never automatically choose a child", async ({ context, page }) => {
  await authenticate(context);
  await mockApi(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Who is learning today?" })).toBeVisible();
  await page.getByRole("button", { name: "Advik Open learning workspace" }).click();
  await expect(page.getByRole("heading", { name: "Advik's learning, in one place." })).toBeVisible();
  await page.getByRole("button", { name: "Ask AI Tutor", exact: true }).click();
  const input = page.getByRole("textbox").last();
  await input.fill("Advik's unfinished question");
  await page.getByRole("button", { name: "Choose child" }).click();
  await page.getByRole("button", { name: "Shanvi Open learning workspace" }).click();
  await expect(page.getByRole("heading", { name: "Shanvi's learning, in one place." })).toBeVisible();
  await page.getByRole("button", { name: "Ask AI Tutor", exact: true }).click();
  await expect(page.getByRole("textbox").last()).toHaveValue("");
  await page.reload();
  await expect(page.getByRole("heading", { name: "Who is learning today?" })).toBeVisible();
});

test("switching families shows only that family's children", async ({ context, page }) => {
  await authenticate(context);
  await mockApi(page);
  await page.goto("/dashboard");
  await page.getByRole("combobox", { name: "Family", exact: true }).selectOption("family-b");
  await expect(page.getByRole("button", { name: "Other Child Open learning workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Advik Open learning workspace" })).toHaveCount(0);
  await page.getByRole("button", { name: "Other Child Open learning workspace" }).click();
  await expect(page.getByRole("heading", { name: "Other Child's learning, in one place." })).toBeVisible();
});

test("a family without children offers setup instead of an empty workspace", async ({ context, page }) => {
  await authenticate(context);
  await mockApi(page, []);
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Add a child", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Academic Setup", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose child" })).toBeVisible();
});

test("an expired callback cannot open a workspace", async ({ page }) => {
  await page.goto("/auth/callback");
  await expect(page.getByRole("status")).toContainText("cancelled or the link has expired");
  await expect(page.getByRole("link", { name: "Back to sign in" })).toBeVisible();
});

test("email link fallback returns through the same callback", async ({ page }) => {
  let requested = false;
  await page.route("https://auth.example.test/auth/v1/otp**", async (route) => {
    const url = new URL(route.request().url());
    expect(url.searchParams.get("redirect_to")).toBe("http://localhost:3000/auth/callback");
    expect(route.request().postDataJSON().email).toBe("parent@example.test");
    requested = true;
    await route.fulfill({ json: {} });
  });
  await page.goto("/");
  await page.getByLabel("Email address").fill("parent@example.test");
  await page.getByRole("button", { name: "Send sign-in link" }).click();
  await expect(page.getByRole("status")).toContainText("Sign-in link sent");
  expect(requested).toBe(true);
});

test("sign-out clears parent access to the dashboard", async ({ context, page }) => {
  await authenticate(context);
  await mockApi(page);
  await page.route("https://auth.example.test/auth/v1/logout**", (route) => route.fulfill({ status: 204 }));
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.goto("/dashboard");
  await expect(page).toHaveURL("http://localhost:3000/");
});

test("login and child chooser fit mobile screens without runtime errors", async ({ context, page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Continue with Google" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("login-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await authenticate(context);
  await mockApi(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Who is learning today?" })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("chooser-mobile.png"), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
