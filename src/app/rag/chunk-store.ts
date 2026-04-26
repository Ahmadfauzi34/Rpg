import { IndexedChunk } from './base-indexer';

export interface ChunkStoreConfig {
  dbName: string;
  storeName: string;
  maxMemoryChunks: number;
  version: number;
}

export class ChunkStore {
  private db: IDBDatabase | null = null;
  private readonly memoryCache = new Map<string, IndexedChunk>();
  private readonly config: ChunkStoreConfig;

  constructor(config: ChunkStoreConfig) {
    this.config = config;
  }

  async init(): Promise<void> {
    if (typeof window === 'undefined' || !window.indexedDB) {
      console.warn("IndexedDB not available, fallback to memory cache only.");
      return Promise.resolve();
    }
    return new Promise((resolve, reject) => {
      const req = window.indexedDB.open(this.config.dbName, this.config.version);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        this.db = req.result;
        resolve();
      };
      req.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(this.config.storeName)) {
          db.createObjectStore(this.config.storeName, {keyPath: 'id'});
        }
      };
    });
  }

  async writeChunks(chunks: IndexedChunk[]): Promise<void> {
    // Populate memory cache first
    for (const chunk of chunks) {
        this._insertToCache(chunk);
    }

    if (!this.db) return;
    
    // Process IndexedDB transaction
    const tx = this.db.transaction(this.config.storeName, 'readwrite');
    const store = tx.objectStore(this.config.storeName);
    
    interface SerializableChunk {
      id: string;
      docId: string;
      text: string;
      termFreq: Record<string, number>;
      modifiedAt: number;
    }
    
    return new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(new Error('Transaction aborted'));

      for (const chunk of chunks) {
        const serializable: SerializableChunk = {
          ...chunk,
          termFreq: Object.fromEntries(chunk.termFreq)
        };
        const req = store.put(serializable);
        req.onerror = () => {
          tx.abort();
        };
      }
    });
  }

  async resolveChunks(chunkIds: string[]): Promise<IndexedChunk[]> {
    const result: IndexedChunk[] = [];
    const toFetch: string[] = [];

    // Layer 1: Memory LRU
    for (const id of chunkIds) {
      const cached = this.memoryCache.get(id);
      if (cached) {
        this._touch(id);
        result.push(cached);
      } else {
        toFetch.push(id);
      }
    }

    // Layer 2: IndexedDB (async stream)
    if (toFetch.length > 0 && this.db) {
      const fetched = await this._fetchFromDb(toFetch);
      for (const chunk of fetched) {
        this._insertToCache(chunk);
        result.push(chunk);
      }
    }

    return result;
  }

  private async _fetchFromDb(ids: string[]): Promise<IndexedChunk[]> {
    if (!this.db) return [];
    const tx = this.db.transaction(this.config.storeName, 'readonly');
    const store = tx.objectStore(this.config.storeName);
    
    const promises = ids.map(id => 
      new Promise<IndexedChunk | undefined>((resolve) => {
        const req = store.get(id);
        req.onsuccess = () => {
          const res = req.result;
          if (res) {
            if (res.termFreq && !(res.termFreq instanceof Map)) {
              res.termFreq = new Map<string, number>(Object.entries(res.termFreq));
            }
            resolve(res);
          } else {
            resolve(undefined);
          }
        };
        req.onerror = () => resolve(undefined);
      })
    );

    const results = await Promise.all(promises);
    return results.filter((c): c is IndexedChunk => c !== undefined);
  }

  private _insertToCache(chunk: IndexedChunk): void {
    if (this.memoryCache.has(chunk.id)) {
      this.memoryCache.delete(chunk.id);
    } else if (this.memoryCache.size >= this.config.maxMemoryChunks) {
      const firstKey = this.memoryCache.keys().next().value;
      if (firstKey !== undefined) this.memoryCache.delete(firstKey);
    }
    this.memoryCache.set(chunk.id, chunk);
  }

  private _touch(id: string): void {
    const chunk = this.memoryCache.get(id);
    if (chunk) {
      this.memoryCache.delete(id);
      this.memoryCache.set(id, chunk);
    }
  }

  purgeMemory(): void {
    this.memoryCache.clear();
  }

  getMemoryStats() {
    return {
      cached: this.memoryCache.size
    };
  }
}
