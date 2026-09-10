import { app, safeStorage } from 'electron';
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { BillingStatus, CloudState, ConnectResult, DeviceLimit, InactiveDevices, LoginInput, PairedDevice, PaymentSlip, RegisterInput, SyncStatus } from '../shared/models';
import { PosDatabase } from './database';

type Session = {
  accessToken: string;
  refreshToken: string;
  voucherSequence?: number;
  shop: { id: string; name: string; tier: string; premiumUntil: string | null };
  device: { id: string; name: string; deviceCode: string; role?: string };
};
class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

/** Credentials, enrolment and sync remain in the main process. */
export class CloudService {
  private session: Session | null = null;
  private pendingSession: Session | null = null;
  private status: SyncStatus = 'signed_out';
  private error: string | null = null;
  private syncing: Promise<CloudState> | null = null;
  private refreshing: Promise<void> | null = null;
  private connecting = false;
  private disconnecting = false;
  private bundlePushAvailable = true;
  private revision = 0;
  private readonly sessionPath = join(app.getPath('userData'), 'cloud-session.bin');

  constructor(private readonly db: PosDatabase) {
    this.session = this.loadSession();
    if (this.session) { this.cacheIdentity(this.session); this.status = 'idle'; }
  }
  state(): CloudState {
    return {
      status: this.status, pending: this.db.countDirty(), lastSyncedAt: this.db.getState('cloud.lastSyncedAt'), error: this.error,
      shopName: this.session?.shop.name ?? null, deviceName: this.session?.device.name ?? null,
      deviceId: this.session?.device.id ?? null, deviceCode: this.session?.device.deviceCode ?? null,
      role: this.session?.device.role ?? null, apiUrl: this.apiUrl(), dataRevision: this.revision,
    };
  }
  setApiUrl(input: string): void {
    const url = new URL(input);
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) throw new Error('The production API URL must use HTTPS');
    const next = input.replace(/\/$/, '');
    if ((this.session || this.pendingSession || this.connecting) && next !== this.apiUrl()) throw new Error('Disconnect before changing the API server');
    this.db.setState('cloud.apiUrl', next);
  }
  private async enroll(path: string, input: object): Promise<ConnectResult> {
    if (this.session || this.pendingSession || this.connecting || this.disconnecting) throw new Error('Finish the current connection first');
    this.connecting = true;
    try {
      const result = await this.request<Session | DeviceLimit | InactiveDevices>('POST', path, { ...input, platform: 'desktop', appVersion: app.getVersion() });
      if ('status' in result && (result.status === 'device_limit' || result.status === 'inactive_devices')) return result;
      const session = result as Session;
      if (!session.shop?.id || !session.device?.id) throw new Error('Invalid sign-in response');
      const previous = this.db.getState('data.shopId');
      if (previous && previous !== session.shop.id) {
        this.pendingSession = session;
        return { status: 'shop_switch', shopName: session.shop.name, unsyncedCount: this.db.countDirty() };
      }
      this.adopt(session);
      return this.syncNow();
    } finally { this.connecting = false; }
  }
  register(input: RegisterInput): Promise<ConnectResult> { return this.enroll('/auth/shops', input); }
  login(input: LoginInput): Promise<ConnectResult> { return this.enroll('/auth/login', input); }
  completeLogin(input: { loginTicket: string; revokeDeviceId?: string; reclaimDeviceId?: string; createNew?: boolean; deviceName: string }): Promise<ConnectResult> { return this.enroll('/auth/login/complete', input); }
  join(input: { pairingCode: string; deviceName: string }): Promise<ConnectResult> {
    return this.enroll('/auth/devices/join', { ...input, previousDeviceId: this.db.getState('device.previousId') ?? undefined });
  }
  createPairingCode(): Promise<{ code: string; expiresAt: string }> { return this.request('POST', '/auth/pairing-codes', {}, true); }
  async confirmSwitch(): Promise<CloudState> {
    if (!this.pendingSession) throw new Error('No shop switch is pending');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure OS storage is unavailable');
    const session = this.pendingSession;
    // Preserve unsynced records before replacing the local shop.
    this.db.sqlite.prepare('VACUUM INTO ?').run(join(app.getPath('userData'), `shop-backup-${Date.now()}.sqlite3`));
    this.db.wipeShopData();
    this.adopt(session); this.pendingSession = null; this.revision++;
    return this.syncNow();
  }
  async cancelSwitch(): Promise<void> {
    const pending = this.pendingSession;
    if (!pending) return;
    await this.request('DELETE', '/auth/devices/self', undefined, false, pending.accessToken).catch(() => {});
    this.pendingSession = null;
  }
  syncNow(): Promise<CloudState> {
    if (this.disconnecting) return Promise.resolve(this.state());
    if (this.syncing) return this.syncing;
    this.syncing = this.runSync().finally(() => { this.syncing = null; });
    return this.syncing;
  }
  private async runSync(): Promise<CloudState> {
    if (!this.session) return this.state();
    if (!this.db.capabilities().cloud) { this.status = 'paused'; this.error = null; return this.state(); }
    this.status = 'syncing'; this.error = null;
    try {
      await this.refresh();
      if (!this.db.capabilities().cloud) { this.status = 'paused'; return this.state(); }
      const attempted = new Set<string>();
      const pushPending = async () => {
      for (let round = 0; round < 1_000; round++) {
        if (this.bundlePushAvailable && !this.db.hasDirtyPrerequisitesForSales()) {
          const bundles = this.db.completeSaleBundles();
          if (bundles.length) {
            try {
              const result = await this.request<any>('POST', '/sync/push-v2', { bundles }, true);
              this.db.reconcilePush(bundles.flatMap(bundle => bundle.changes), result);
              continue;
            } catch (error) {
              if (error instanceof ApiError && error.status === 404) this.bundlePushAvailable = false;
              else throw error;
            }
          }
        }
        const changes = this.db.dirtyChanges();
        if (!changes.length) break;
        const before = JSON.stringify(changes);
        if (attempted.has(before)) break;
        attempted.add(before);
        const result = await this.request<any>('POST', '/sync/push', { changes }, true);
        this.db.reconcilePush(changes, result);
        if (before === JSON.stringify(this.db.dirtyChanges())) break;
      }
      };
      await pushPending();
      for (let round = 0; round < 1_000; round++) {
        const since = Number(this.db.getState('cloud.cursor') ?? 0);
        const page = await this.request<any>('GET', `/sync/pull?since=${since}&limit=500`, undefined, true);
        if (!Number.isSafeInteger(page.nextSince) || page.nextSince < since) throw new Error('Invalid sync cursor');
        this.db.applyPulled(page.changes ?? [], page.nextSince);
        if (page.changes?.length) this.revision++;
        if (!page.hasMore || !page.changes?.length) break;
      }
      // Pull reconciliation can queue tombstones and repaired price references.
      await pushPending();
      this.db.setState('cloud.lastSyncedAt', new Date().toISOString());
      const pending = this.db.countDirty();
      this.status = pending ? 'error' : 'idle';
      this.error = pending ? `${pending} changes are still pending. Check Diagnostics or retry sync.` : null;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Cloud sync failed';
      this.error = message;
      this.status = message.includes('SHOP_SUSPENDED') ? 'suspended' : message.includes('SUBSCRIPTION_EXPIRED') ? 'expired' : error instanceof TypeError || (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) ? 'offline' : 'error';
    }
    return this.state();
  }
  async signOut(): Promise<CloudState> {
    if (this.connecting) throw new Error('Wait for the connection to finish');
    this.disconnecting = true;
    try {
      if (this.syncing) await this.syncing;
      if (this.refreshing) await this.refreshing.catch(() => {});
      if (this.session) {
        // Best effort online release; pairing can reuse the saved previous identity offline.
        await this.request('DELETE', '/auth/devices/self', undefined, true).catch(() => {});
        this.db.setState('device.previousId', this.session.device.id);
      }
      this.session = null; this.status = 'signed_out'; this.error = null;
      this.db.setState('cloud.cursor', '0');
      for (const key of ['device.role', 'entitlement.tier', 'entitlement.premiumUntil']) this.db.setState(key, null);
      if (existsSync(this.sessionPath)) unlinkSync(this.sessionPath);
      this.revision++;
      return this.state();
    } finally { this.disconnecting = false; }
  }
  async devices(): Promise<PairedDevice[]> { return (await this.request<{ devices: PairedDevice[] }>('GET', '/auth/devices', undefined, true)).devices; }
  async revokeDevice(id: string): Promise<void> {
    if (id === this.session?.device.id) throw new Error('Use Disconnect for this desktop');
    await this.request('DELETE', '/auth/devices/' + encodeURIComponent(id), undefined, true);
  }
  async billingStatus(): Promise<BillingStatus> {
    const result = await this.request<BillingStatus>('GET', '/billing/status', undefined, true); this.saveEntitlement(result); return result;
  }
  async redeemCode(code: string): Promise<BillingStatus> {
    const result = await this.request<BillingStatus>('POST', '/billing/redeem', { code }, true); this.saveEntitlement(result); return result;
  }
  submitSlip(input: { tier: 'offline_plus' | 'cloud_pro'; method: string; amount: number; reference: string; note?: string }): Promise<PaymentSlip> { return this.request('POST', '/billing/slips', input, true); }
  async listSlips(): Promise<PaymentSlip[]> { return (await this.request<{ slips: PaymentSlip[] }>('GET', '/billing/slips', undefined, true)).slips; }
  private saveEntitlement(value: BillingStatus): void {
    this.db.setState('entitlement.tier', value.tier); this.db.setState('entitlement.premiumUntil', value.premiumUntil);
    if (this.session) { this.session.shop.tier = value.tier; this.session.shop.premiumUntil = value.premiumUntil; this.saveSession(this.session); }
    this.revision++;
  }
  private apiUrl(): string { return this.db.getState('cloud.apiUrl') ?? process.env.STORE_POS_API_URL ?? 'http://localhost:3000/api'; }
  private refresh(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      if (!this.session) throw new Error('Connect this desktop first');
      const next = await this.request<Session>('POST', '/auth/refresh', { refreshToken: this.session.refreshToken });
      if (next.shop.id !== this.session.shop.id) throw new Error('Refresh returned a different shop');
      this.adopt(next);
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }
  private async request<T>(method: string, path: string, body?: unknown, authenticated = false, token?: string, retried = false): Promise<T> {
    if (authenticated && !this.session) throw new Error('Connect this desktop first');
    const response = await fetch(this.apiUrl() + path, {
      method, signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json', ...((token || authenticated) ? { Authorization: 'Bearer ' + (token ?? this.session!.accessToken) } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({})) as any;
    if (!response.ok) {
      if (response.status === 401 && authenticated && !retried) { await this.refresh(); return this.request(method, path, body, authenticated, token, true); }
      throw new ApiError(Array.isArray(data.message) ? data.message.join(', ') : data.message || `Request failed (${response.status})`, response.status);
    }
    return data as T;
  }
  private cacheIdentity(session: Session): void {
    this.db.setState('data.shopId', session.shop.id);
    this.db.setState('device.code', session.device.deviceCode);
    this.db.setState('device.role', session.device.role ?? 'owner');
    this.db.setState('entitlement.tier', session.shop.tier ?? 'free');
    this.db.setState('entitlement.premiumUntil', session.shop.premiumUntil ?? null);
    const floor = session.voucherSequence;
    if (Number.isSafeInteger(floor) && floor! > Number(this.db.getState('voucher.sequence') ?? 0)) this.db.setState('voucher.sequence', String(floor));
  }
  private adopt(session: Session): void {
    this.saveSession(session); this.session = session; this.cacheIdentity(session);
  }
  private saveSession(session: Session): void {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Secure OS storage is unavailable on this computer');
    writeFileSync(this.sessionPath, safeStorage.encryptString(JSON.stringify(session)));
  }
  private loadSession(): Session | null {
    try { return existsSync(this.sessionPath) && safeStorage.isEncryptionAvailable() ? JSON.parse(safeStorage.decryptString(readFileSync(this.sessionPath))) : null; }
    catch { return null; }
  }
}
