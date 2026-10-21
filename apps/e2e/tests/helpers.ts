import { expect, type Browser, type BrowserContext, type Page } from '@playwright/test';

/** What the room exposes on `window.__sbsRoom` in development builds (see room-view.tsx). */
interface RoomHandle {
  doc: { getMap(name: string): { get(key: string): unknown } };
  status: string;
  synced: boolean;
  lastTestRun: {
    passed: number;
    total: number;
    results: { index: number; hidden: boolean; status: string; stdin?: string }[];
  } | null;
}

declare global {
  interface Window {
    __sbsRoom?: RoomHandle;
  }
}

export interface Actor {
  name: string;
  context: BrowserContext;
  page: Page;
}

const PASSWORD = 'sbs-e2e-pass-1';

function newContext(browser: Browser) {
  // Clipboard access for pasting code and for the room's copy-link buttons.
  return browser.newContext({ permissions: ['clipboard-read', 'clipboard-write'] });
}
let counter = 0;

/** A fresh account per run, so leftover rooms or practice matches never get in the way. */
function uniqueEmail(name: string) {
  const slug = name.toLowerCase().replace(/[^a-z]+/g, '-');
  return `e2e-${slug}-${Date.now().toString(36)}-${++counter}@example.test`;
}

/** Signs a new user up with the development email + password form, in its own context. */
export async function signUp(browser: Browser, name: string): Promise<Actor> {
  const context = await newContext(browser);
  const page = await context.newPage();
  await page.goto('/login?mode=signup');
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByLabel('Email', { exact: true }).fill(uniqueEmail(name));
  await page.getByLabel('Password', { exact: true }).fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/dashboard');
  return { name, context, page };
}

/** A visitor with no account (the candidate), in its own context. */
export async function guest(browser: Browser, name: string): Promise<Actor> {
  const context = await newContext(browser);
  const page = await context.newPage();
  return { name, context, page };
}

/** From the dashboard: creates an interview room and opens it. Returns the room's slug. */
export async function createRoom(page: Page, title: string) {
  await page.getByRole('button', { name: 'New room' }).click();
  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Language').selectOption('python');
  await page.getByRole('button', { name: 'Create room' }).click();
  await page.getByRole('link', { name: 'Open room' }).click();
  await page.waitForURL('**/r/*');
  await waitForRoom(page);
  return slugFromUrl(page);
}

/** Opens the room link as a guest, enters a name, accepts the recording notice and joins. */
export async function joinAsGuest(actor: Actor, slug: string, title: string) {
  const { page } = actor;
  await page.goto(`/r/${slug}`);
  await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
  await page.getByLabel('Your name').fill(actor.name);
  const join = page.getByRole('button', { name: 'Join the room' });
  await expect(join).toBeDisabled();
  await page.getByText('I understand and agree').click();
  await join.click();
  await waitForRoom(page);
}

export function slugFromUrl(page: Page) {
  const match = /\/r\/([^/?#]+)/.exec(page.url());
  if (!match) throw new Error(`Not a room URL: ${page.url()}`);
  return match[1]!;
}

/** Waits until the page has joined the room and synced its shared document. */
export async function waitForRoom(page: Page) {
  await expect.poll(() => page.evaluate(() => window.__sbsRoom?.synced ?? false)).toBe(true);
}

export function sharedCode(page: Page, language = 'python') {
  return page.evaluate(
    (lang) => String(window.__sbsRoom?.doc.getMap('code').get(lang) ?? ''),
    language,
  );
}

export function connectionStatus(page: Page) {
  return page.evaluate(() => window.__sbsRoom?.status ?? null);
}

export function presence(page: Page) {
  return page.getByRole('list', { name: 'People in the room' });
}

export async function openRoomTab(page: Page, name: 'Discuss' | 'Code' | 'Design') {
  await page.getByRole('tablist', { name: 'Room' }).getByRole('tab', { name }).click();
}

export function codeEditor(page: Page) {
  return page.getByLabel('Code editor').locator('.monaco-editor');
}

/**
 * Replaces the editor's contents by pasting, since typing multi-line code would be re-indented
 * by the editor. (The paste shows up as an activity signal, as it would for a real candidate.)
 */
export async function replaceCode(page: Page, code: string) {
  await page.evaluate((text) => navigator.clipboard.writeText(text), code);
  await codeEditor(page).click();
  await page.keyboard.press('ControlOrMeta+A');
  await page.keyboard.press('ControlOrMeta+V');
  await expect.poll(() => sharedCode(page)).toBe(code);
}

/** Puts the caret at the very end of the editor and types a new line there. */
export async function appendLine(page: Page, line: string) {
  await codeEditor(page).click();
  await page.keyboard.press('ControlOrMeta+End');
  await page.keyboard.press('Enter');
  await page.keyboard.type(line);
}

/** Puts the caret at the very start of the editor and types a new line there. */
export async function prependLine(page: Page, line: string) {
  await codeEditor(page).click();
  await page.keyboard.press('ControlOrMeta+Home');
  await page.keyboard.type(line);
  await page.keyboard.press('Enter');
}

/** The interviewer panel: pick a question by title and show it to the candidate. */
export async function showQuestion(page: Page, title: string) {
  const panel = page.getByRole('complementary', { name: 'Interviewer panel' });
  await panel.getByRole('tab', { name: 'Questions' }).click();
  await panel.getByLabel('Search questions').fill(title);
  await panel.getByRole('button', { name: new RegExp(`^${title}`) }).click();
  await panel.getByRole('button', { name: 'Show to candidate' }).click();
  await expect(panel.getByRole('button', { name: /Show again/ })).toBeVisible();
  return panel;
}
