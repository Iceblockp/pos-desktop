import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { CloudState, LoginInput, RegisterInput, SyncStatus } from '../shared/models';
import { PosDatabase } from './database';

type Session = {
  accessToken: string;
  refreshToken: string;
  shop: { id: string; name: string };
  device: { id: string; name: string; deviceCode: string };
};

/** API calls and tokens never enter the renderer process. */
export class CloudService {
  private session: Session | null = null;
  private status: SyncStatus = 'signed_out';
  private error: string | null = null;
  private readonly sessionPath = join(app.getPath('userData'), 'cloud-session.bin');

  constructor(private readonly db: PosDatabase) {
    this.session = this.loadSession();
    this.status = this.session ? 'idle' : 'signed_out';
  }

  state(): CloudState {
    return {
      status: this.status,
      pending: this.db.countDirty(),
      lastSyncedAt: this.db.getState('cloud.lastSyncedAt'),
      error: this.error,
      shopName: this.session?.shop.name ?? null,
      deviceName: this.session?.device.name ?? null,
    };
  }

  setApiUrl(input: string): void {
    const url = new URL(input);
    if (url.protocol !== 'https:' && !(url.hostname === 'localhost' || url.hostname === '127.0.0.1')) {
      throw new Error('The production API URL must use HTTPS');
    }
    this.db.setState('cloud.apiUrl', input.replace(/\/$/, ''));
  }

  async register(input: RegisterInput): Promise<CloudState> {
    const session = await this.request<Session>('POST', '/auth/shops', {
      shopName: input.shopName, phone: input.phone, password: input.password,
      deviceName: input.deviceName, platform: 'desktop', currency: input.currency, timezone: input.timezone,
    }, false);
    this.adopt(session);
    return this.syncNow();
  }

  async login(input: LoginInput): Promise<CloudState> {
    const result = await this.request<Session & { status?: string }>('POST', '/auth/login', {
      phone: input.phone, password: input.password, deviceName: input.deviceName, platform: 'desktop',
    }, false);
    if (result.status === 'device_limit') throw new Error('This shop has reached its device limit. Remove an old device first.');
    this.adopt(result);
    return this.syncNow();
  }

  async syncNow(): Promise<CloudState> {
    if (!this.session) return this.state();
    this.status = 'syncing'; this.error = null;
    try {
      await this.refresh();
      for (let round = 0; round < 50; round += 1) {
        const changes = this.db.dirtyChanges();
        if (!changes.length) break;
        const result = await this.request<any>('POST', '/sync/push', { changes }, true);
        this.db.reconcilePush(changes, result);
        if (!(result.accepted?.length || result.skipped?.length)) break;
      }
      for (let round = 0; round < 50; round += 1) {
        const since = Number(this.db.getState('cloud.cursor') ?? '0');
        const page = await this.request<any>('GET', `/sync/pull?since=${since}&limit=500`, undefined, true);
        if (page.changes?.length) this.db.applyPulled(page.changes);
        this.db.setState('cloud.cursor', String(page.nextSince ?? since));
        if (!page.hasMore || !page.changes?.length) break;
      }
      this.db.setState('cloud.lastSyncedAt', new Date().toISOString());
      this.status = 'idle';
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloud sync failed';
      this.error = message;
      this.status = message.includes('SHOP_SUSPENDED') ? 'suspended' : message.includes('SUBSCRIPTION_EXPIRED') ? 'expired' : message.includes('fetch') ? 'offline' : 'error';
    }
    return this.state();
  }

  signOut(): CloudState {
    this.session = null; this.status = 'signed_out'; this.error = null;
    if (existsSync(this.sessionPath)) unlinkSync(this.sessionPath);
    return this.state();
  }

  private apiUrl(): string { return this.db.getState('cloud.apiUrl') ?? process.env.STORE_POS_API_URL ?? 'http://localhost:3000/api'; }

  private async refresh(): Promise<void> {
    if (!this.session) return;
    const session = await this.request<Session>('POST', '/auth/refresh', { refreshToken: this.session.refreshToken }, false);
    this.adopt({ ...this.session, ...session, shop: session.shop ?? this.session.shop, device: session.device ?? this.session.device });
  }

  private async request<T>(method: string, path: string, body?: unknown, authenticated = false): Promise<T> {
    const response = await fetch(`${this.apiUrl()}${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(authenticated && this.session ? { Authorization: `Bearer ${this.session.accessToken}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.code ?? data.message ?? `API request failed (${response.status})`);
    return data as T;
  }

  private adopt(session: Session): void {
    this.session = session;
    this.status = 'idle'; this.error = null;
    this.db.setState('device.code', session.device.deviceCode);
    this.saveSession(session);
  }

  private saveSession(session: Session): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure OS storage is unavailable on this computer');
    writeFileSync(this.sessionPath, safeStorage.encryptString(JSON.stringify(session)));
  }

  private loadSession(): Session | null {
    try {
      if (!existsSync(this.sessionPath) || !safeStorage.isEncryptionAvailable()) return null;
      return JSON.parse(safeStorage.decryptString(readFileSync(this.sessionPath))) as Session;
    } catch { return null; }
  }
}
