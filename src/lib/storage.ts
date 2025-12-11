declare const puter: {
  auth: {
    signIn: () => Promise<boolean>;
    signOut: () => Promise<void>;
    isSignedIn: () => boolean;
    getUser: () => Promise<{ username: string; email?: string; uuid?: string }>;
  };
  kv: {
    set: (key: string, value: string) => Promise<void>;
    get: (key: string) => Promise<string | null>;
    del: (key: string) => Promise<void>;
    list: (pattern?: string, returnValues?: boolean) => Promise<{ key: string; value: string }[]>;
  };
};

export interface StorageAdapter {
  set: (key: string, value: string) => Promise<void>;
  get: (key: string) => Promise<string | null>;
  del: (key: string) => Promise<void>;
  list: (pattern?: string, returnValues?: boolean) => Promise<{ key: string; value: string }[]>;
}

class LocalStorageAdapter implements StorageAdapter {
  private prefix = "secretkeeper_";

  async set(key: string, value: string): Promise<void> {
    localStorage.setItem(this.prefix + key, value);
  }

  async get(key: string): Promise<string | null> {
    return localStorage.getItem(this.prefix + key);
  }

  async del(key: string): Promise<void> {
    localStorage.removeItem(this.prefix + key);
  }

  async list(pattern?: string, returnValues?: boolean): Promise<{ key: string; value: string }[]> {
    const results: { key: string; value: string }[] = [];
    const regex = pattern ? new RegExp("^" + pattern.replace("*", ".*")) : null;

    for (let i = 0; i < localStorage.length; i++) {
      const fullKey = localStorage.key(i);
      if (fullKey && fullKey.startsWith(this.prefix)) {
        const key = fullKey.slice(this.prefix.length);
        if (!regex || regex.test(key)) {
          const value = returnValues ? localStorage.getItem(fullKey) || "" : "";
          results.push({ key, value });
        }
      }
    }
    return results;
  }
}

class PuterKVAdapter implements StorageAdapter {
  async set(key: string, value: string): Promise<void> {
    await puter.kv.set(key, value);
  }

  async get(key: string): Promise<string | null> {
    return await puter.kv.get(key);
  }

  async del(key: string): Promise<void> {
    await puter.kv.del(key);
  }

  async list(pattern?: string, returnValues?: boolean): Promise<{ key: string; value: string }[]> {
    return await puter.kv.list(pattern, returnValues);
  }
}

export function getStorageAdapter(isPuterSignedIn: boolean): StorageAdapter {
  if (isPuterSignedIn && typeof puter !== "undefined") {
    return new PuterKVAdapter();
  }
  return new LocalStorageAdapter();
}

export const localStorageAdapter = new LocalStorageAdapter();
export const puterKVAdapter = new PuterKVAdapter();
