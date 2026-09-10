export interface CredentialStore {
  hasCredential(credentialRef: string): Promise<boolean>;
}

export class InMemoryCredentialStore implements CredentialStore {
  private readonly refs = new Set<string>();

  put(credentialRef: string): void { this.refs.add(credentialRef); }
  remove(credentialRef: string): void { this.refs.delete(credentialRef); }
  async hasCredential(credentialRef: string): Promise<boolean> { return this.refs.has(credentialRef); }
}
