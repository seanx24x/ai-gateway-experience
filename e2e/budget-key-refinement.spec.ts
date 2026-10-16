import { test, expect, type Locator, type Page } from '@playwright/test';
import type { WorkspaceState } from '../src/lib/workspace';

const storageKey = 'sean-gateway-demo-v2';
const keyInspector = (page: Page) => page.getByRole('region', { name: 'API key inspector', exact: true });
const budgetInspector = (page: Page) => page.getByRole('region', { name: 'Budget scope inspector', exact: true });
const budgetCoverage = (page: Page) => page.getByRole('region', { name: 'Gateway budget coverage', exact: true });

async function ready(page: Page, path: string) {
  await page.goto(path);
  await expect(page.locator('.app')).toHaveAttribute('data-demo-ready', 'true');
}

async function workspace(page: Page): Promise<WorkspaceState> {
  return page.evaluate(key => JSON.parse(localStorage.getItem(key)!).workspace, storageKey);
}

async function requestSnapshot(page: Page) {
  return page.evaluate(key => JSON.stringify(JSON.parse(localStorage.getItem(key)!).requests), storageKey);
}

async function expectInlineSectionFits(section: Locator, width: number) {
  await section.evaluate(element => Promise.all(element.getAnimations().map(animation => animation.finished.catch(() => undefined))));
  await expect.poll(async () => {
    const bounds = await section.boundingBox();
    return !!bounds && bounds.x >= 0 && bounds.x + bounds.width <= width + 1;
  }, { message: 'The inline section fits the viewport without clipping either horizontal edge.' }).toBe(true);
  expect(await section.evaluate(element => element.closest('dialog') === null)).toBe(true);
}

async function expectDetailsBelongToRow(inspector: Locator, origin: Locator) {
  await expect(inspector).toBeVisible();
  await expect(origin).toHaveAttribute('aria-expanded', 'true');
  const row = inspector.locator('xpath=ancestor::article[1]');
  await expect(row).toBeVisible();
  await expect(row).toContainText((await origin.getAttribute('aria-label'))!.replace(/^Inspect (?:key|budget for) /, ''));
  await expect(row.getByRole('button', { name: (await origin.getAttribute('aria-label'))!, exact: true })).toHaveCount(1);
}

async function createKey(page: Page, name: string, attribution = 'team') {
  await page.getByRole('button', { name: 'Create key', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Create demo key metadata', exact: true });
  await editor.getByRole('textbox', { name: 'Key name', exact: true }).fill(name);
  await editor.getByRole('combobox', { name: 'Spend attribution', exact: true }).selectOption(attribution);
  await editor.getByRole('button', { name: 'Create demo metadata', exact: true }).click();
  await expect(editor).toBeHidden();
  const origin = page.getByRole('button', { name: `Inspect key ${name}`, exact: true });
  await expectDetailsBelongToRow(keyInspector(page), origin);
  await expect(origin).toBeFocused();
  return origin;
}

test('@hosted key details expand in their row, remain nonmodal, and preserve their keyboard origin', async ({ page }) => {
  await ready(page, '/keys');
  const requests = await requestSnapshot(page);
  const inspector = keyInspector(page);
  const origin = page.getByRole('button', { name: 'Inspect key Local development', exact: true });
  const otherOrigin = page.getByRole('button', { name: 'Inspect key Coding agent', exact: true });
  await expect(inspector).toBeHidden();
  await expect(page.locator('.ops-key-row.is-selected')).toHaveCount(0);
  await expect(origin).toHaveAttribute('aria-expanded', 'false');
  await origin.focus();
  await page.keyboard.press('Enter');
  await expectDetailsBelongToRow(inspector, origin);
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(inspector).toContainText('demo_key_local');

  // Another inventory row remains interactive while details are visible.
  await otherOrigin.click();
  await expectDetailsBelongToRow(inspector, otherOrigin);
  await expect(origin).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('.ops-key-row.is-selected')).toHaveCount(1);
  await expect(inspector).toContainText('demo_key_agent');
  await otherOrigin.click();
  await expect(inspector).toBeHidden();
  await expect(otherOrigin).toHaveAttribute('aria-expanded', 'false');
  await origin.click();
  await page.keyboard.press('Escape');
  await expect(inspector).toBeHidden();
  await expect(origin).toBeFocused();

  // Filtering away an expanded row closes it instead of silently selecting another.
  await origin.click();
  const search = page.getByRole('textbox', { name: 'Search demo keys', exact: true });
  await search.fill('Coding agent');
  await expect(origin).toHaveCount(0);
  await expect(otherOrigin).toBeVisible();
  await expect(otherOrigin).toHaveAttribute('aria-expanded', 'false');
  await expect(inspector).toBeHidden();
  await search.fill('does-not-exist');
  await expect(page.getByRole('heading', { name: 'No matching keys.', exact: true })).toBeVisible();
  await expect(page.locator('.ops-key-row')).toHaveCount(0);
  await page.getByRole('button', { name: 'Clear key filters', exact: true }).click();
  await expect(origin).toBeVisible();
  await expect(inspector).toBeHidden();
  await page.getByRole('combobox', { name: 'Demo key status', exact: true }).selectOption('revoked');
  await expect(page.getByRole('heading', { name: 'No matching keys.', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Clear key filters', exact: true }).click();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await origin.click();
  await expect(inspector).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(origin).toBeFocused();
  expect(await requestSnapshot(page)).toBe(requests);
});

test('@hosted key and cap changes return to their inline evidence and persist without inventing credentials', async ({ page }) => {
  await ready(page, '/keys');
  const requests = await requestSnapshot(page);
  const name = 'Review integration';
  const origin = await createKey(page, name);
  const row = page.locator('.ops-key-row').filter({ has: origin });
  await expect(row).toContainText('Team attribution');
  await expect(row).toContainText('No enabled demo cap');
  await keyInspector(page).getByRole('button', { name: 'Add budget', exact: true }).click();
  const createBudget = page.getByRole('region', { name: 'Create demo budget', exact: true });
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  const selectedKey = await createBudget.getByRole('combobox', { name: 'Demo API key', exact: true }).inputValue();
  expect((await workspace(page)).keys.find(key => key.id === selectedKey)?.name).toBe(name);
  await createBudget.getByRole('spinbutton', { name: 'Spend limit (USD)', exact: true }).fill('18');
  await createBudget.getByRole('group', { name: 'Refresh period', exact: true }).getByRole('radio', { name: 'Weekly', exact: true }).check();
  await createBudget.getByRole('button', { name: 'Save demo budget', exact: true }).click();
  await expect(row).toContainText('$18.00 / weekly');
  await expectDetailsBelongToRow(keyInspector(page), origin);
  await expect(origin).toBeFocused();
  expect(await requestSnapshot(page)).toBe(requests);

  await ready(page, '/budgets');
  const budgetOrigin = page.getByRole('button', { name: `Inspect budget for ${name}`, exact: true });
  await budgetOrigin.click();
  await expectDetailsBelongToRow(budgetInspector(page), budgetOrigin);
  await expect(budgetInspector(page).locator('[data-scope-lane]')).toHaveAttribute('data-scope-lane', 'team');
  await expect(budgetInspector(page)).toContainText('API key budget');
  await expect(budgetInspector(page)).toContainText('Team budget');
  await expect(budgetInspector(page)).not.toContainText('User budget');
  await budgetInspector(page).getByRole('button', { name: 'Edit budget', exact: true }).click();
  const editBudget = page.getByRole('region', { name: 'Edit demo budget', exact: true });
  await expect(editBudget.getByRole('combobox', { name: 'Demo API key', exact: true })).toBeDisabled();
  await editBudget.getByRole('spinbutton', { name: 'Spend limit (USD)', exact: true }).fill('42');
  await editBudget.getByRole('group', { name: 'Refresh period', exact: true }).getByRole('radio', { name: 'No reset', exact: true }).check();
  await editBudget.getByRole('checkbox', { name: 'Enable this demo cap', exact: true }).uncheck();
  await editBudget.getByRole('button', { name: 'Save demo budget', exact: true }).click();
  await expectDetailsBelongToRow(budgetInspector(page), budgetOrigin);
  await expect(budgetOrigin).toBeFocused();
  await page.reload();
  await expect(budgetInspector(page)).toBeHidden();
  await expect(page.locator('.ops-budget-row').filter({ has: budgetOrigin })).toContainText('$42.00');
  const storedBudget = (await workspace(page)).budgets.find(budget => budget.keyId === selectedKey)!;
  expect(storedBudget).toMatchObject({ limitUsd: 42, period: 'none', enabled: false });
  await expect(page.getByRole('progressbar')).toHaveCount(0);
  await budgetOrigin.click();
  await budgetInspector(page).getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.locator('.ops-budget-row').filter({ has: budgetOrigin }).getByRole('region', { name: 'Budget scope inspector', exact: true, includeHidden: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Remove this demo budget?', exact: true }).getByRole('button', { name: 'Remove demo budget', exact: true }).click();
  await expect(budgetOrigin).toHaveCount(0);
  expect((await workspace(page)).keys.some(key => key.id === selectedKey)).toBe(true);
  expect(await requestSnapshot(page)).toBe(requests);

  await ready(page, '/keys');
  await origin.click();
  await keyInspector(page).getByRole('button', { name: 'Revoke', exact: true }).click();
  await expect(row.getByRole('region', { name: 'API key inspector', exact: true, includeHidden: true })).toBeVisible();
  await page.getByRole('dialog', { name: 'Review demo key revocation', exact: true }).getByRole('button', { name: 'Revoke demo key', exact: true }).click();
  await expect(row).toContainText('Revoked in demo');
  await expectDetailsBelongToRow(keyInspector(page), origin);
  await expect(keyInspector(page).getByRole('button', { name: 'Add budget', exact: true })).toHaveCount(0);
  await page.reload();
  await origin.click();
  await keyInspector(page).getByRole('button', { name: 'Restore demo metadata', exact: true }).click();
  await expect(row).toContainText('Active in demo');
  await expectDetailsBelongToRow(keyInspector(page), origin);
  // Restoring the only revoked result intentionally removes it from that filtered view.
  await keyInspector(page).getByRole('button', { name: 'Revoke', exact: true }).click();
  await page.getByRole('dialog', { name: 'Review demo key revocation', exact: true }).getByRole('button', { name: 'Revoke demo key', exact: true }).click();
  const statusFilter = page.getByRole('combobox', { name: 'Demo key status', exact: true });
  await statusFilter.selectOption('revoked');
  await expect(keyInspector(page)).toBeHidden();
  await origin.click();
  await expectDetailsBelongToRow(keyInspector(page), origin);
  await keyInspector(page).getByRole('button', { name: 'Restore demo metadata', exact: true }).click();
  await expect(origin).toHaveCount(0);
  await expect(keyInspector(page)).toBeHidden();
  await expect(statusFilter).toBeFocused();
  await page.getByRole('button', { name: 'Clear key filters', exact: true }).click();
  await expect(row).toContainText('Active in demo');
  await page.reload();
  await expect(row).toContainText('Active in demo');
  expect(await requestSnapshot(page)).toBe(requests);
  expect((await workspace(page)).keys.find(key => key.id === selectedKey)?.status).toBe('active');
  await expect(page.getByRole('textbox', { name: /secret value|usable credential/i })).toHaveCount(0);
});

test('@hosted focused in-page forms cancel back to the selected key without losing inventory filters or scroll position', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 700 });
  await ready(page, '/keys');
  const search = page.getByRole('textbox', { name: 'Search demo keys', exact: true });
  await search.fill('Local');
  const origin = page.getByRole('button', { name: 'Inspect key Local development', exact: true });
  await origin.click();
  const before = await workspace(page);
  const addBudget = keyInspector(page).getByRole('button', { name: 'Add budget', exact: true });
  await addBudget.scrollIntoViewIfNeeded();
  const scrollBefore = await page.evaluate(() => scrollY);
  expect(scrollBefore).toBeGreaterThan(0);
  await addBudget.click();
  const budgetEditor = page.getByRole('region', { name: 'Create demo budget', exact: true });
  await budgetEditor.getByRole('spinbutton', { name: 'Spend limit (USD)', exact: true }).fill('99');
  await budgetEditor.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(budgetEditor).toBeHidden();
  await expect(search).toHaveValue('Local');
  await expectDetailsBelongToRow(keyInspector(page), origin);
  await expect(origin).toBeFocused();
  await expect.poll(() => page.evaluate(() => scrollY)).toBeCloseTo(scrollBefore, 0);
  expect(await workspace(page)).toEqual(before);

  await keyInspector(page).getByRole('button', { name: 'Add budget', exact: true }).click();
  await expect(budgetEditor.getByRole('spinbutton', { name: 'Spend limit (USD)', exact: true })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(budgetEditor).toBeHidden();
  await expect(origin).toBeFocused();
  await expectDetailsBelongToRow(keyInspector(page), origin);
  const create = page.getByRole('button', { name: 'Create key', exact: true });
  await create.click();
  const keyEditor = page.getByRole('region', { name: 'Create demo key metadata', exact: true });
  await keyEditor.getByRole('textbox', { name: 'Key name', exact: true }).fill('Not saved');
  await page.getByRole('button', { name: 'Back to keys', exact: true }).click();
  await expect(keyEditor).toBeHidden();
  await expect(search).toHaveValue('Local');
  await expectDetailsBelongToRow(keyInspector(page), origin);
  await expect(create).toBeFocused();
  expect(await workspace(page)).toEqual(before);
});

test('budget coverage is an independent inline explanation and exhausted cap eligibility explains the next step', async ({ page }) => {
  await ready(page, '/budgets');
  const coverage = page.getByRole('button', { name: 'How coverage works', exact: true });
  await coverage.focus();
  await page.keyboard.press('Enter');
  await expect(budgetCoverage(page)).toBeVisible();
  await expect(budgetInspector(page)).toBeHidden();
  await expect(budgetCoverage(page).locator('[data-scope-lane]')).toHaveAttribute('data-scope-lane', 'member');
  await page.keyboard.press('Escape');
  await expect(budgetCoverage(page)).toBeHidden();
  await expect(coverage).toBeFocused();
  await coverage.click();
  const origin = page.getByRole('button', { name: 'Inspect budget for Coding agent', exact: true });
  await origin.click();
  await expectDetailsBelongToRow(budgetInspector(page), origin);
  await expect(budgetCoverage(page)).toBeVisible();
  await budgetCoverage(page).getByRole('button', { name: 'OIDC', exact: true }).click();
  await expect(budgetInspector(page).locator('[data-scope-lane]')).toHaveAttribute('data-scope-lane', 'team');
  await expect(budgetCoverage(page).locator('[data-scope-lane]')).toHaveAttribute('data-scope-lane', 'oidc');
  await coverage.click();
  await expect(budgetCoverage(page)).toBeHidden();
  await expect(budgetInspector(page)).toBeVisible();
  await page.getByRole('button', { name: 'Create budget', exact: true }).click();
  const editor = page.getByRole('region', { name: 'Create demo budget', exact: true });
  await editor.getByRole('button', { name: 'Save demo budget', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Create budget', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Manage keys', exact: true })).toBeVisible();
  const savedOrigin = page.getByRole('button', { name: 'Inspect budget for Local development', exact: true });
  await expectDetailsBelongToRow(budgetInspector(page), savedOrigin);
  await expect(savedOrigin).toBeFocused();
  await origin.click();
  await expect(savedOrigin).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('Escape');
  await expect(origin).toBeFocused();
  await page.reload();
  await expect(budgetInspector(page)).toBeHidden();
  await expect(page.getByRole('button', { name: 'Create budget', exact: true })).toBeDisabled();
});

test('budget and key inventories, inline details and in-page forms fit five widths in both themes', async ({ page }, info) => {
  test.setTimeout(180_000);
  for (const theme of ['light', 'dark']) {
    for (const width of [360, 390, 768, 1440, 1920]) {
      await page.setViewportSize({ width, height: width < 768 ? 844 : 1000 });
      for (const view of ['budgets', 'keys'] as const) {
        await ready(page, `/${view}`);
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.getByRole('button', { name: `Switch to ${theme} theme`, exact: true }).click();
        const inspector = view === 'budgets' ? budgetInspector(page) : keyInspector(page);
        const create = page.getByRole('button', { name: view === 'budgets' ? 'Create budget' : 'Create key', exact: true });
        await expect(inspector).toBeHidden();
        const initial = await create.boundingBox();
        expect(initial?.height).toBeGreaterThanOrEqual(44);
        expect(initial ? initial.y + initial.height : Infinity).toBeLessThanOrEqual(width < 768 ? 844 : 1000);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `artifacts/inline-controls/${info.project.name}/${view}-${theme}-${width}.png`, fullPage: true, animations: 'disabled' });

        const origin = page.getByRole('button', { name: view === 'budgets' ? 'Inspect budget for Coding agent' : 'Inspect key Local development', exact: true });
        await origin.click();
        await expectDetailsBelongToRow(inspector, origin);
        await expectInlineSectionFits(inspector, width);
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        await page.screenshot({ path: `artifacts/inline-controls/${info.project.name}/${view}-detail-${theme}-${width}.png`, fullPage: true, animations: 'disabled' });
        await page.keyboard.press('Escape');
        await expect(origin).toBeFocused();

        await create.click();
        const editor = page.getByRole('region', { name: view === 'budgets' ? 'Create demo budget' : 'Create demo key metadata', exact: true });
        await expect(editor).toBeVisible();
        await expectInlineSectionFits(editor, width);
        await expect(page.locator('dialog[open]')).toHaveCount(0);
        const submit = editor.getByRole('button', { name: view === 'budgets' ? 'Save demo budget' : 'Create demo metadata', exact: true });
        await submit.scrollIntoViewIfNeeded();
        const submitBounds = await submit.boundingBox();
        expect(submitBounds!.height).toBeGreaterThanOrEqual(44);
        expect(submitBounds!.y).toBeGreaterThanOrEqual(0);
        expect(submitBounds!.y + submitBounds!.height).toBeLessThanOrEqual(width < 768 ? 844 : 1000);
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        // Full-page captures start at the document origin so offscreen fixed skip links stay out of the captured page.
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
        await page.screenshot({ path: `artifacts/inline-controls/${info.project.name}/${view}-create-${theme}-${width}.png`, fullPage: true, animations: 'disabled' });
        await page.keyboard.press('Escape');
        await expect(create).toBeFocused();
      }
    }
  }
});
