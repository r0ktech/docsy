import { test, expect } from '@playwright/test';
import path from 'node:path';

const SAMPLE = path.resolve('samples/sample-apartment-lease.pdf');

test('sign up → upload → process → ask → open citation → revisit conversation', async ({ page }) => {
  const email = `e2e-${Date.now()}@example.com`;

  // Sign up
  await page.goto('/sign-up');
  await page.getByLabel('Name').fill('Casey Tester');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('a long test password');
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page).toHaveURL(/\/app$/);
  await expect(page.getByRole('heading', { name: /Welcome back, Casey/ })).toBeVisible();

  // Upload a document through the dialog
  await page.getByRole('button', { name: 'Upload a document' }).click();
  await page.getByLabel('Choose files to upload').setInputFiles(SAMPLE);
  await expect(page.getByText('Uploaded — processing has started')).toBeVisible();
  await page.keyboard.press('Escape');

  // Wait for processing to finish (the dashboard refreshes itself)
  await expect(page.getByText('1 of 1 document ready to search.')).toBeVisible({ timeout: 60_000 });

  // Ask a question from the dashboard
  const ask = page.getByLabel('Ask a question about your documents');
  await ask.fill('How much is the security deposit?');
  await ask.press('Enter');
  await expect(page).toHaveURL(/\/app\/chat\//);
  const conversationUrl = page.url().split('?')[0];

  // Grounded answer with a source list
  await expect(page.getByText('Sources', { exact: true })).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole('listitem').filter({ hasText: /security deposit/i }).first()).toBeVisible();

  // Open the first citation in the source panel
  await page.getByRole('button', { name: /^Source 1:/ }).first().click();
  const panel = page.getByRole('complementary', { name: 'Source' });
  await expect(panel).toBeVisible();
  await expect(panel.getByText(/page \d+/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Cited passage', exact: false })).toBeVisible({ timeout: 30_000 });

  // Revisit via the chat history
  await page.goto('/app/chats');
  await page.locator('#app-main').getByRole('link', { name: 'How much is the security deposit?' }).click();
  await expect(page).toHaveURL(conversationUrl);
  await expect(page.getByText('How much is the security deposit?').first()).toBeVisible();
  await expect(page.getByText('Sources', { exact: true })).toBeVisible();
});

test('protected pages redirect to sign-in', async ({ page }) => {
  await page.goto('/app/documents');
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fapp%2Fdocuments/);
});

test('landing page explains the product and shows real limits', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ask your documents');
  await expect(page.getByText(/25 documents in your library/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Privacy policy' })).toBeVisible();
});
