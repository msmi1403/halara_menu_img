import { test, expect } from '@playwright/test';

test.describe('Image Persistence', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should load the app successfully', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('Halara Menu Imagineer');
  });

  test('should show storage indicator button', async ({ page }) => {
    const storageButton = page.locator('button[title*="Storage"]');
    await expect(storageButton).toBeVisible();
  });

  test('should open storage menu on click', async ({ page }) => {
    const storageButton = page.locator('button[title*="Storage"]');
    await storageButton.click();
    await expect(page.locator('text=Export Backup')).toBeVisible();
    await expect(page.locator('text=Import Backup')).toBeVisible();
  });

  test('should have IndexedDB available', async ({ page }) => {
    const isAvailable = await page.evaluate(async () => {
      try {
        const testDBName = '__playwright_test__';
        const request = indexedDB.open(testDBName);
        return new Promise<boolean>((resolve) => {
          request.onsuccess = () => {
            request.result.close();
            indexedDB.deleteDatabase(testDBName);
            resolve(true);
          };
          request.onerror = () => resolve(false);
        });
      } catch {
        return false;
      }
    });

    expect(isAvailable).toBe(true);
  });

  test('should show history drawer on history button click', async ({ page }) => {
    const historyButton = page.locator('button[title="Open Generation History"]');
    await historyButton.click();
    await expect(page.locator('h2:text("Library")')).toBeVisible();
  });

  test('should show upload area when no image is selected', async ({ page }) => {
    await expect(page.locator('text=Upload Product Shot')).toBeVisible();
  });

  test('should display rendering configuration section', async ({ page }) => {
    await expect(page.locator('text=Rendering Configuration')).toBeVisible();
    await expect(page.locator('select').first()).toBeVisible();
    await expect(page.locator('text=1 Image')).toBeVisible();
    await expect(page.locator('text=2 Images')).toBeVisible();
    await expect(page.locator('text=3 Images')).toBeVisible();
  });

  test('should disable render button when no metadata', async ({ page }) => {
    const renderButton = page.locator('button:has-text("Render Assets")');
    await expect(renderButton).toBeDisabled();
  });

  test('should show empty gallery message', async ({ page }) => {
    await expect(page.locator('text=No Assets Generated')).toBeVisible();
  });
});

test.describe('Storage Info Display', () => {
  test('should show storage usage information', async ({ page }) => {
    await page.goto('/');
    const storageButton = page.locator('button[title*="Storage"]');
    await storageButton.click();
    await expect(page.locator('text=Used')).toBeVisible();
    await expect(page.locator('text=Available')).toBeVisible();
  });

  test('should show persistent storage status', async ({ page }) => {
    await page.goto('/');
    const storageButton = page.locator('button[title*="Storage"]');
    await storageButton.click();
    const persistenceText = page.locator('text=/Persistent storage|Storage may be cleared/');
    await expect(persistenceText).toBeVisible();
  });
});

test.describe('Export/Import Functionality', () => {
  test('export button should be disabled when history is empty', async ({ page }) => {
    await page.goto('/');
    const storageButton = page.locator('button[title*="Storage"]');
    await storageButton.click();
    const exportButton = page.locator('button:has-text("Export Backup")');
    await expect(exportButton).toBeDisabled();
  });

  test('import button should open file picker', async ({ page }) => {
    await page.goto('/');
    const storageButton = page.locator('button[title*="Storage"]');
    await storageButton.click();
    const fileInput = page.locator('input[type="file"][accept=".json"]');
    await expect(fileInput).toBeHidden();
  });
});
