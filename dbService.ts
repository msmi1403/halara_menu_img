import { HistoryItem, GeneratedImage } from "./types";

const DB_NAME = "ShopifyAdMasterDB_v2";
const STORE_NAME = "generations";
const DB_VERSION = 1;

export async function requestPersistentStorage(): Promise<boolean> {
  if (navigator.storage?.persist) {
    return navigator.storage.persist();
  }
  return false;
}

export async function isStoragePersistent(): Promise<boolean> {
  if (navigator.storage?.persisted) {
    return navigator.storage.persisted();
  }
  return false;
}

export interface StorageEstimate {
  usage: number;
  quota: number;
  percentUsed: number;
}

export async function getStorageEstimate(): Promise<StorageEstimate | null> {
  if (navigator.storage?.estimate) {
    const { usage = 0, quota = 0 } = await navigator.storage.estimate();
    return {
      usage,
      quota,
      percentUsed: quota > 0 ? (usage / quota) * 100 : 0
    };
  }
  return null;
}

export async function isIndexedDBAvailable(): Promise<boolean> {
  try {
    const testDBName = '__indexeddb_test__';
    const request = indexedDB.open(testDBName);
    return new Promise((resolve) => {
      request.onsuccess = () => {
        request.result.close();
        indexedDB.deleteDatabase(testDBName);
        resolve(true);
      };
      request.onerror = () => resolve(false);
    });
  } catch {
    return false;
  }
}

export function initDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB open error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
}

export async function saveHistoryItem(item: HistoryItem): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const storageItem = {
      ...item,
      variants: item.variants.map(v => ({ ...v, url: "" }))
    };

    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    store.put(storageItem);

    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}

export async function getAllHistory(): Promise<HistoryItem[]> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => {
      const items = request.result as HistoryItem[];
      const hydrated = items.map(item => ({
        ...item,
        variants: item.variants.map(v => ({
          ...v,
          url: v.blob ? URL.createObjectURL(v.blob) : ""
        }))
      }));
      resolve(hydrated.sort((a, b) => b.timestamp - a.timestamp));
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function clearAllHistory(): Promise<void> {
  const db = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function base64ToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export interface ExportedData {
  version: number;
  exportedAt: number;
  items: Array<{
    id: string;
    timestamp: number;
    metadata: any;
    sourceImage: string;
    variants: Array<{
      id: string;
      blob: string;
      timestamp: number;
    }>;
    settings: any;
    thumbnail: string;
  }>;
}

export async function exportAllData(): Promise<string> {
  const db = await initDB();
  const items = await new Promise<HistoryItem[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result as HistoryItem[]);
    request.onerror = () => reject(request.error);
  });

  const exportedItems = await Promise.all(
    items.map(async (item) => ({
      id: item.id,
      timestamp: item.timestamp,
      metadata: item.metadata,
      sourceImage: item.sourceImage instanceof Blob
        ? await blobToBase64(item.sourceImage)
        : item.sourceImage,
      variants: await Promise.all(
        item.variants.map(async (v) => ({
          id: v.id,
          blob: v.blob ? await blobToBase64(v.blob) : '',
          timestamp: v.timestamp
        }))
      ),
      settings: item.settings,
      thumbnail: item.thumbnail
    }))
  );

  const exportData: ExportedData = {
    version: DB_VERSION,
    exportedAt: Date.now(),
    items: exportedItems
  };

  return JSON.stringify(exportData, null, 2);
}

export async function importData(jsonString: string): Promise<number> {
  const data: ExportedData = JSON.parse(jsonString);

  if (!data.items || !Array.isArray(data.items)) {
    throw new Error("Invalid backup format");
  }

  const db = await initDB();
  let importedCount = 0;

  for (const item of data.items) {
    const sourceBlob = typeof item.sourceImage === 'string' && item.sourceImage.startsWith('data:')
      ? await base64ToBlob(item.sourceImage)
      : item.sourceImage;

    const variants = await Promise.all(
      item.variants.map(async (v) => ({
        id: v.id,
        url: '',
        blob: v.blob ? await base64ToBlob(v.blob) : undefined,
        timestamp: v.timestamp
      }))
    );

    const historyItem: HistoryItem = {
      id: item.id,
      timestamp: item.timestamp,
      metadata: item.metadata,
      sourceImage: sourceBlob as Blob,
      variants,
      settings: item.settings,
      thumbnail: item.thumbnail
    };

    await new Promise<void>((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(historyItem);

      request.onsuccess = () => {
        importedCount++;
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  }

  return importedCount;
}
