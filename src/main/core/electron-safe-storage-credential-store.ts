import { createHash, randomBytes } from 'node:crypto';
import {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
} from 'node:fs/promises';
import * as path from 'node:path';
import { safeStorage } from 'electron';
import type { CredentialStore } from './credential-store';

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(plainText: string): Buffer;
  decryptString(encrypted: Buffer): string;
}

export interface CredentialFileSystem {
  mkdir: typeof mkdir;
  readFile: typeof readFile;
  rename: typeof rename;
  unlink: typeof unlink;
  writeFile: typeof writeFile;
}

const credentialFileSystem: CredentialFileSystem = {
  mkdir,
  readFile,
  rename,
  unlink,
  writeFile,
};

export class ElectronSafeStorageCredentialStore implements CredentialStore {
  constructor(
    private readonly directory: string,
    private readonly encryption: SafeStorageAdapter = safeStorage,
    private readonly fileSystem: CredentialFileSystem = credentialFileSystem,
    private readonly stagingId: () => string = () => (
      randomBytes(16).toString('hex')
    ),
  ) {}
  private credentialPath(ref: string): string { if (!ref.trim()) throw new Error('credential_ref must be non-empty.'); return path.join(this.directory, `${createHash('sha256').update(ref).digest('hex')}.credential`); }
  private requireEncryption(): void { if (!this.encryption.isEncryptionAvailable()) throw new Error('OS-backed credential encryption is unavailable.'); }
  async hasCredential(ref: string): Promise<boolean> { try { await this.readCredential(ref); return true; } catch { return false; } }
  async readCredential(ref: string): Promise<string> { this.requireEncryption(); const encrypted = await this.fileSystem.readFile(this.credentialPath(ref)); return this.encryption.decryptString(encrypted); }
  async writeCredential(ref: string, secret: string): Promise<void> {
    this.requireEncryption();
    if (!secret) throw new Error('Credential secret must be non-empty.');
    const targetPath = this.credentialPath(ref);
    const stagingPath = `${targetPath}.stage-${this.stagingId()}`;
    const encrypted = this.encryption.encryptString(secret);
    await this.fileSystem.mkdir(this.directory, { recursive: true, mode: 0o700 });
    try {
      await this.fileSystem.writeFile(stagingPath, encrypted, {
        mode: 0o600,
        flag: 'wx',
      });
      await this.fileSystem.rename(stagingPath, targetPath);
    } catch (error) {
      try {
        await this.fileSystem.unlink(stagingPath);
      } catch (cleanupError) {
        if ((cleanupError as NodeJS.ErrnoException).code !== 'ENOENT') {
          // The primary persistence error remains authoritative.
        }
      }
      throw error;
    }
  }
  async deleteCredential(ref: string): Promise<void> { try { await this.fileSystem.unlink(this.credentialPath(ref)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; } }
}
