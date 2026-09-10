export interface CredentialStore {
  hasCredential(credentialRef: string): Promise<boolean>;
  readCredential(credentialRef: string): Promise<string>;
  writeCredential(credentialRef: string, secret: string): Promise<void>;
  deleteCredential(credentialRef: string): Promise<void>;
}

export class InMemoryCredentialStore implements CredentialStore {
  private readonly credentials = new Map<string, string>();

  put(credentialRef: string, secret = 'AVAILABLE'): void { this.credentials.set(credentialRef, secret); }
  remove(credentialRef: string): void { this.credentials.delete(credentialRef); }
  async hasCredential(credentialRef: string): Promise<boolean> { return this.credentials.has(credentialRef); }
  async readCredential(credentialRef: string): Promise<string> { const value = this.credentials.get(credentialRef); if (value === undefined) throw new Error(`Credential is unavailable: ${credentialRef}`); return value; }
  async writeCredential(credentialRef: string, secret: string): Promise<void> { this.credentials.set(credentialRef, secret); }
  async deleteCredential(credentialRef: string): Promise<void> { this.credentials.delete(credentialRef); }
}
