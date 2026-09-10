import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import * as path from 'node:path';
import { safeStorage } from 'electron';
import type { CredentialStore } from './credential-store';

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export class ElectronSafeStorageCredentialStore implements CredentialStore {
  constructor(
    private readonly directory: string,
    private readonly encryption: SafeStorageAdapter = safeStorage,
  ) {}
  private credentialPath(ref: string): string { if (!ref.trim()) throw new Error('credential_ref must be non-empty.'); return path.join(this.directory, `${createHash('sha256').update(ref).digest('hex')}.credential`); }
  private requireEncryption(): void { if (!this.encryption.isEncryptionAvailable()) throw new Error('OS-backed credential encryption is unavailable.'); }
  async hasCredential(ref: string): Promise<boolean> { try { await this.readCredential(ref); return true; } catch { return false; } }
  async readCredential(ref: string): Promise<string> { this.requireEncryption(); const encrypted = await readFile(this.credentialPath(ref)); return this.encryption.decryptString(encrypted); }
  async writeCredential(ref: string, secret: string): Promise<void> { this.requireEncryption(); if (!secret) throw new Error('Credential secret must be non-empty.'); await mkdir(this.directory, { recursive: true, mode: 0o700 }); await writeFile(this.credentialPath(ref), this.encryption.encryptString(secret), { mode: 0o600 }); }
  async deleteCredential(ref: string): Promise<void> { try { await unlink(this.credentialPath(ref)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}
