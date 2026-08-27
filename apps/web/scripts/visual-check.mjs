import { chromium } from "playwright";

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH,
  headless: true,
});
const errors = [];
const targetUrl = process.env.VISUAL_CHECK_URL ?? "http://127.0.0.1:3000";

async function inspect(name, viewport) {
  const page = await browser.newPage({ viewport });
  page.on("console", (message) => {
    if (message.type() === "error" && !message.text().includes("/_next/hmr")) {
      const text = message.text();
      if (!text.includes("Failed to load resource: the server responded with a status of 403")) {
        errors.push(`${name}: ${text}`);
      }
    }
  });
  page.on("pageerror", (error) => errors.push(`${name}: ${error.message}`));

  await page.goto(targetUrl, { waitUntil: "networkidle" });
  const metrics = await page.evaluate(() => ({
    width: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
    textLength: document.body.innerText.trim().length,
  }));
  await page.screenshot({ path: `/tmp/usdcare-${name}.png`, fullPage: true });
  const previewButton = page.getByRole("button", { name: "Preview onboarding" });
  if (await previewButton.count()) {
    await previewButton.click();
    await page.locator(".choice-card").nth(1).click();
    const orgName = page.getByPlaceholder("Lakeside Diagnostic Centre");
    await orgName.fill("Harbourview Clinic");
    await page.screenshot({ path: `/tmp/usdcare-${name}-onboarding.png`, fullPage: true });
  } else {
    await page.getByRole("button", { name: "Continue with email" }).click();
    await page.locator('input[type="email"]').waitFor({ state: "visible" });
    await page.screenshot({ path: `/tmp/usdcare-${name}-privy-login.png`, fullPage: true });
  }
  await page.close();
  return metrics;
}

const desktop = await inspect("desktop", { width: 1440, height: 1000 });
const mobile = await inspect("mobile", { width: 390, height: 844 });

await browser.close();

if (desktop.scrollWidth > desktop.width || mobile.scrollWidth > mobile.width) {
  throw new Error(`Horizontal overflow detected: ${JSON.stringify({ desktop, mobile })}`);
}
if (desktop.textLength < 100 || mobile.textLength < 100) {
  throw new Error("Rendered page appears blank.");
}
if (errors.length) {
  throw new Error(`Browser errors:\n${errors.join("\n")}`);
}

console.log(JSON.stringify({ desktop, mobile }, null, 2));
