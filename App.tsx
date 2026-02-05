import React, { useState, useRef, useEffect, useCallback } from 'react';
import { analyzeProductImage, generateAdImage, GeminiError, GeminiErrorType } from './geminiService';
import { ProductMetadata, GenerationSettings, GeneratedImage, HistoryItem } from './types';
import { Button } from './components/Button';
import { Input, TextArea } from './components/Input';
import { HistoryDrawer } from './components/HistoryDrawer';
import {
  getAllHistory,
  saveHistoryItem,
  deleteHistoryItem,
  clearAllHistory,
  requestPersistentStorage,
  isStoragePersistent,
  getStorageEstimate,
  exportAllData,
  importData,
  StorageEstimate
} from './dbService';

// Image input validation constants
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function getErrorMessage(error: unknown): string {
  if (error instanceof GeminiError) {
    switch (error.type) {
      case GeminiErrorType.NETWORK:
        return 'Network connection failed. Please check your internet connection and try again.';
      case GeminiErrorType.QUOTA_EXCEEDED:
        return 'API quota exceeded. Please wait a few minutes and try again, or check your API usage limits.';
      case GeminiErrorType.INVALID_API_KEY:
        return 'Invalid API key. Please check your API key configuration.';
      case GeminiErrorType.CONTENT_FILTERED:
        return 'The content was filtered by safety settings. Try adjusting your input image or instructions.';
      case GeminiErrorType.NO_IMAGE_DATA:
        return 'The model did not return an image. Please try again with different settings.';
      default:
        return `An unexpected error occurred: ${error.message}`;
    }
  }

  const message = error instanceof Error ? error.message : String(error);
  if (message.toLowerCase().includes('quota')) {
    return 'Browser storage quota exceeded. Clear some history or export a backup before continuing.';
  }

  return 'An unexpected error occurred. Please try again.';
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}

async function base64ToBlob(base64: string, mime: string = 'image/png'): Promise<Blob> {
  const res = await fetch(`data:${mime};base64,${base64}`);
  return res.blob();
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9);
}

function createThumbnail(url: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const size = 200;
      canvas.width = size;
      canvas.height = size;
      if (ctx) {
        const min = Math.min(img.width, img.height);
        const sx = (img.width - min) / 2;
        const sy = (img.height - min) / 2;
        ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      }
      resolve(canvas.toDataURL('image/jpeg', 0.7));
    };
    img.src = url;
  });
}

const App: React.FC = () => {
  const [sourceImage, setSourceImage] = useState<string | null>(null);
  const [sourceBlob, setSourceBlob] = useState<Blob | null>(null);
  const [metadata, setMetadata] = useState<ProductMetadata | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [settings, setSettings] = useState<GenerationSettings>({
    aspectRatio: '1:1', // Default to 1080x1080 square
    imageSize: '1K',
    numberOfVariants: 1,
    additionalInstructions: '',
    nyMode: false,
    resinRosinMode: false
  });
  
  const [hasApiKey, setHasApiKey] = useState<boolean | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isHistoryOpen, setIsHistoryOpen] = useState(false);
  const [currentHistoryId, setCurrentHistoryId] = useState<string | null>(null);

  const [storageInfo, setStorageInfo] = useState<StorageEstimate | null>(null);
  const [isPersistent, setIsPersistent] = useState(false);
  const [showStorageMenu, setShowStorageMenu] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sourceFileInputRef = useRef<HTMLInputElement>(null);

  // Track object URLs for cleanup to prevent memory leaks
  const activeUrlsRef = useRef<Set<string>>(new Set());

  const trackUrl = useCallback((url: string) => {
    activeUrlsRef.current.add(url);
    return url;
  }, []);

  const revokeUrl = useCallback((url: string) => {
    if (activeUrlsRef.current.has(url)) {
      URL.revokeObjectURL(url);
      activeUrlsRef.current.delete(url);
    }
  }, []);

  const revokeAllUrls = useCallback(() => {
    activeUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    activeUrlsRef.current.clear();
  }, []);

  async function refreshHistory(): Promise<void> {
    try {
      // Revoke existing history item URLs before loading new ones
      history.forEach(item => {
        item.variants.forEach(v => {
          if (v.url) revokeUrl(v.url);
        });
      });

      const savedHistory = await getAllHistory();
      // Track new URLs created by getAllHistory
      savedHistory.forEach(item => {
        item.variants.forEach(v => {
          if (v.url) trackUrl(v.url);
        });
      });
      setHistory(savedHistory);
    } catch (err) {
      console.error("Failed to load history", err);
    }
  }

  async function refreshStorageInfo(): Promise<void> {
    const estimate = await getStorageEstimate();
    setStorageInfo(estimate);
    const persistent = await isStoragePersistent();
    setIsPersistent(persistent);
  }

  useEffect(() => {
    async function init(): Promise<void> {
      if (window.aistudio) {
        const selected = await window.aistudio.hasSelectedApiKey();
        setHasApiKey(selected);
      } else {
        setHasApiKey(true);
      }
      await refreshHistory();
      await requestPersistentStorage();
      await refreshStorageInfo();
    }
    init();

    // Cleanup: revoke all object URLs on unmount to prevent memory leaks
    return () => {
      revokeAllUrls();
    };
  }, []);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      alert(`Invalid file type: ${file.type || 'unknown'}. Please upload a JPEG, PNG, WebP, or GIF image.`);
      if (sourceFileInputRef.current) {
        sourceFileInputRef.current.value = '';
      }
      return;
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
      alert(`File too large (${sizeMB}MB). Maximum allowed size is 10MB.`);
      if (sourceFileInputRef.current) {
        sourceFileInputRef.current.value = '';
      }
      return;
    }

    const reader = new FileReader();
    reader.onloadend = async () => {
      const base64 = (reader.result as string).split(',')[1];
      const blob = await base64ToBlob(base64);
      setSourceImage(base64);
      setSourceBlob(blob);
      setCurrentHistoryId(null);
      setResults([]);
      handleAnalysis(base64);
      // Reset file input so same file can be selected again
      if (sourceFileInputRef.current) {
        sourceFileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  }

  async function handleAnalysis(img: string): Promise<void> {
    setIsAnalyzing(true);
    try {
      const data = await analyzeProductImage(img);
      setMetadata(data);
    } catch (error) {
      console.error("Analysis failed", error);
      alert(getErrorMessage(error));
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function handleGenerate(): Promise<void> {
    if (!sourceImage || !metadata || !sourceBlob) return;

    if (window.aistudio && !(await window.aistudio.hasSelectedApiKey())) {
      await window.aistudio.openSelectKey();
      setHasApiKey(true);
    }

    setIsGenerating(true);
    try {
      const imagePromises = Array(settings.numberOfVariants)
        .fill(null)
        .map(() => generateAdImage(sourceImage, metadata, settings));
      const b64Results = await Promise.all(imagePromises);

      const newVariants = await Promise.all(
        b64Results.map(async (b64WithPrefix) => {
          const b64Data = b64WithPrefix.split(',')[1];
          const blob = await base64ToBlob(b64Data);
          return {
            id: generateId(),
            url: trackUrl(URL.createObjectURL(blob)),
            blob,
            timestamp: Date.now()
          };
        })
      );

      const updatedResults = [...newVariants, ...results].slice(0, 10);
      setResults(updatedResults);

      setIsSaving(true);
      const historyId = currentHistoryId || generateId();
      const thumbnail = await createThumbnail(updatedResults[0].url);

      const historyItem: HistoryItem = {
        id: historyId,
        timestamp: Date.now(),
        metadata,
        sourceImage: sourceBlob,
        variants: updatedResults,
        settings,
        thumbnail
      };

      await saveHistoryItem(historyItem);
      setCurrentHistoryId(historyId);
      await refreshHistory();
      await refreshStorageInfo();
    } catch (error: unknown) {
      console.error("Generation/Save failed", error);
      alert(getErrorMessage(error));
    } finally {
      setIsGenerating(false);
      setIsSaving(false);
    }
  }

  function handleRestore(item: HistoryItem): void {
    // Revoke URLs from previous results before restoring new ones
    results.forEach(r => revokeUrl(r.url));

    if (item.sourceImage instanceof Blob) {
      setSourceBlob(item.sourceImage);
      const reader = new FileReader();
      reader.onloadend = () => setSourceImage((reader.result as string).split(',')[1]);
      reader.readAsDataURL(item.sourceImage);
    } else {
      setSourceImage(item.sourceImage);
    }

    setMetadata(item.metadata);
    setSettings(item.settings);
    // Track URLs from restored variants (already tracked via history)
    setResults(item.variants);
    setCurrentHistoryId(item.id);
    setIsHistoryOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function handleDeleteHistory(id: string): Promise<void> {
    await deleteHistoryItem(id);
    if (currentHistoryId === id) setCurrentHistoryId(null);
    await refreshHistory();
    await refreshStorageInfo();
  }

  async function handleClearHistory(): Promise<void> {
    if (!confirm("Clear all generation history? This cannot be undone.")) return;
    await clearAllHistory();
    setHistory([]);
    setCurrentHistoryId(null);
    await refreshStorageInfo();
  }

  async function handleExport(): Promise<void> {
    setIsExporting(true);
    try {
      const jsonData = await exportAllData();
      const blob = new Blob([jsonData], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `halara-menu-imagineer-backup-${new Date().toISOString().split('T')[0]}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setShowStorageMenu(false);
    } catch (err) {
      console.error("Export failed:", err);
      alert("Failed to export data. Please try again.");
    } finally {
      setIsExporting(false);
    }
  }

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const count = await importData(text);
      await refreshHistory();
      await refreshStorageInfo();
      alert(`Successfully imported ${count} item(s).`);
      setShowStorageMenu(false);
    } catch (err) {
      console.error("Import failed:", err);
      alert("Failed to import data. Please check the file format.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  }

  function formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';

    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const exponent = Math.floor(Math.log(bytes) / Math.log(k));
    const formatted = parseFloat((bytes / Math.pow(k, exponent)).toFixed(1));

    return `${formatted} ${sizes[exponent]}`;
  }

  function reset(): void {
    // Revoke URLs from current results to prevent memory leaks
    results.forEach(r => revokeUrl(r.url));
    setSourceImage(null);
    setSourceBlob(null);
    setMetadata(null);
    setResults([]);
    setCurrentHistoryId(null);
    if (sourceFileInputRef.current) {
      sourceFileInputRef.current.value = '';
    }
  }

  if (hasApiKey === false && window.aistudio) {
    const aistudio = window.aistudio;
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center p-6 text-center">
        <div className="max-w-md bg-white p-10 rounded-[2.5rem] shadow-2xl border border-gray-100">
          <div className="bg-indigo-600 w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-xl shadow-indigo-100">
             <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
          </div>
          <h1 className="text-3xl font-black text-gray-900 mb-4 tracking-tight">Halara Menu Imagineer</h1>
          <p className="text-gray-500 mb-8 font-medium leading-relaxed">To generate high-end commercial assets, select an API key from a paid project.</p>
          <Button className="w-full py-4 text-lg" onClick={async () => {
            await aistudio.openSelectKey();
            setHasApiKey(true);
          }}>
            Connect API Key
          </Button>
        </div>
      </div>
    );
  }

  if (hasApiKey === null) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24 bg-[#f8fafc]">
      <HistoryDrawer 
        isOpen={isHistoryOpen}
        onClose={() => setIsHistoryOpen(false)}
        items={history}
        onRestore={handleRestore}
        onDelete={handleDeleteHistory}
        onClearAll={handleClearHistory}
      />

      <header className="bg-white border-b sticky top-0 z-30 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-1.5 rounded-lg shadow-lg shadow-indigo-100">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 leading-tight">Halara Menu Imagineer</h1>
              <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">AI Image Generator</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
             <div className="relative">
               <button
                 onClick={() => setShowStorageMenu(!showStorageMenu)}
                 className={`group relative p-2.5 rounded-xl transition-all ${
                   storageInfo && storageInfo.percentUsed > 80
                     ? 'text-amber-500 hover:text-amber-600 hover:bg-amber-50'
                     : 'text-gray-400 hover:text-indigo-600 hover:bg-indigo-50'
                 }`}
                 title={`Storage: ${storageInfo ? formatBytes(storageInfo.usage) : 'N/A'}`}
               >
                 <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
                 </svg>
                 {isPersistent && (
                   <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full flex items-center justify-center border-2 border-white">
                     <svg className="w-2 h-2 text-white" fill="currentColor" viewBox="0 0 20 20">
                       <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                     </svg>
                   </span>
                 )}
               </button>

               {showStorageMenu && (
                 <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-gray-100 p-4 z-50">
                   <h3 className="text-xs font-black text-gray-900 uppercase tracking-widest mb-3">Storage</h3>

                   {storageInfo && (
                     <div className="space-y-2 mb-4">
                       <div className="flex justify-between text-sm">
                         <span className="text-gray-500">Used</span>
                         <span className="font-bold text-gray-900">{formatBytes(storageInfo.usage)}</span>
                       </div>
                       <div className="flex justify-between text-sm">
                         <span className="text-gray-500">Available</span>
                         <span className="font-bold text-gray-900">{formatBytes(storageInfo.quota)}</span>
                       </div>
                       <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                         <div
                           className={`h-full rounded-full transition-all ${
                             storageInfo.percentUsed > 80 ? 'bg-amber-500' : 'bg-indigo-600'
                           }`}
                           style={{ width: `${Math.min(storageInfo.percentUsed, 100)}%` }}
                         />
                       </div>
                       <div className="flex items-center gap-2 text-xs">
                         <span className={`w-2 h-2 rounded-full ${isPersistent ? 'bg-green-500' : 'bg-gray-300'}`} />
                         <span className="text-gray-500">
                           {isPersistent ? 'Persistent storage enabled' : 'Storage may be cleared by browser'}
                         </span>
                       </div>
                     </div>
                   )}

                   <div className="border-t border-gray-100 pt-3 space-y-2">
                     <button
                       onClick={handleExport}
                       disabled={isExporting || history.length === 0}
                       className="w-full py-2 px-3 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                     >
                       {isExporting ? (
                         <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                       ) : (
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                         </svg>
                       )}
                       Export Backup
                     </button>
                     <button
                       onClick={() => fileInputRef.current?.click()}
                       disabled={isImporting}
                       className="w-full py-2 px-3 text-left text-sm font-bold text-gray-700 hover:bg-gray-50 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                     >
                       {isImporting ? (
                         <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                       ) : (
                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                         </svg>
                       )}
                       Import Backup
                     </button>
                     <input
                       ref={fileInputRef}
                       type="file"
                       accept=".json"
                       onChange={handleImport}
                       className="hidden"
                     />
                   </div>
                 </div>
               )}
             </div>

             <button
              onClick={() => setIsHistoryOpen(true)}
              className="group relative p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all"
              title="Open Generation History"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {history.length > 0 && (
                <span className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-600 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm group-hover:scale-110 transition-transform">
                  {history.length}
                </span>
              )}
            </button>
            <div className="h-8 w-px bg-gray-100 mx-2" />
            <Button variant="ghost" onClick={reset} className="text-sm py-1.5 font-bold uppercase tracking-tighter">New Project</Button>
          </div>
        </div>
      </header>

      {isSaving && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-6 py-2 rounded-full shadow-2xl z-40 flex items-center gap-3 animate-in fade-in slide-in-from-top-4">
          <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          <span className="text-xs font-black uppercase tracking-widest">Updating Library...</span>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-6 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
            <div className="bg-gray-50 px-6 py-4 border-b border-gray-100">
              <h2 className="text-xs font-black text-gray-900 uppercase tracking-widest">1. Reference Image</h2>
            </div>
            <div className="p-6">
              {!sourceImage ? (
                <div className="border-2 border-dashed border-gray-200 rounded-2xl p-12 flex flex-col items-center justify-center text-center hover:border-indigo-400 hover:bg-indigo-50/30 transition-all cursor-pointer relative group">
                  <input ref={sourceFileInputRef} type="file" className="absolute inset-0 opacity-0 cursor-pointer" onChange={handleFileChange} accept="image/*" />
                  <div className="bg-white shadow-md p-4 rounded-2xl mb-4 group-hover:scale-110 transition-transform pointer-events-none">
                    <svg className="w-8 h-8 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                  </div>
                  <p className="text-sm font-bold text-gray-700 pointer-events-none">Upload Product Shot</p>
                  <p className="text-xs text-gray-400 mt-2 pointer-events-none">1:1 recommended for best results</p>
                </div>
              ) : (
                <div className="relative group rounded-2xl overflow-hidden border border-gray-100 bg-gray-50 shadow-inner">
                  <img src={`data:image/png;base64,${sourceImage}`} className="w-full h-auto object-contain max-h-[300px]" alt="Source" />
                  <button onClick={reset} className="absolute top-3 right-3 p-2 bg-black/50 backdrop-blur-md text-white rounded-full hover:bg-red-500 transition-colors">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  {isAnalyzing && (
                    <div className="absolute inset-0 bg-white/90 backdrop-blur-md flex flex-col items-center justify-center animate-in fade-in">
                      <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-3" />
                      <span className="text-xs font-black text-indigo-600 uppercase tracking-widest">Extracting Metadata...</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </section>

          {metadata && (
            <section className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden animate-in slide-in-from-bottom-4 duration-500">
               <div className="bg-gray-50 px-6 py-4 border-b border-gray-100">
                <h2 className="text-xs font-black text-gray-900 uppercase tracking-widest">2. Identified Details</h2>
              </div>
              <div className="p-6 space-y-5">
                <Input
                  label="Strain Name"
                  value={metadata.strainName}
                  onChange={e => setMetadata({ ...metadata, strainName: e.target.value })}
                />
                <Input
                  label="Primary Fruit Flavor"
                  value={metadata.fruitFlavor}
                  onChange={e => setMetadata({ ...metadata, fruitFlavor: e.target.value })}
                />
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Device/Primary Color</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={metadata.primaryColor}
                      onChange={e => setMetadata({ ...metadata, primaryColor: e.target.value })}
                      className="flex-1 px-4 py-2.5 border-2 border-gray-100 rounded-xl bg-gray-50 font-mono text-sm outline-none focus:border-indigo-500 transition-colors"
                      placeholder="#3B82F6"
                    />
                    <input
                      type="color"
                      value={metadata.primaryColor.startsWith('#') ? metadata.primaryColor : '#cccccc'}
                      onChange={e => setMetadata({ ...metadata, primaryColor: e.target.value })}
                      className="w-12 h-11 rounded-xl border-2 border-gray-100 cursor-pointer"
                    />
                  </div>
                </div>
                <Input
                  label="Secondary Colors"
                  value={metadata.secondaryColors.join(", ")}
                  onChange={e => setMetadata({
                    ...metadata,
                    secondaryColors: e.target.value.split(",").map(s => s.trim())
                  })}
                />
                <TextArea
                  label="Vibe Notes / Aroma"
                  value={metadata.notes}
                  onChange={e => setMetadata({ ...metadata, notes: e.target.value })}
                />
              </div>
            </section>
          )}

          <section className="bg-white rounded-3xl shadow-sm border border-gray-200 overflow-hidden">
             <div className="bg-gray-50 px-6 py-4 border-b border-gray-100">
                <h2 className="text-xs font-black text-gray-900 uppercase tracking-widest">3. Rendering Configuration</h2>
              </div>
            <div className="p-6 space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Ratio</label>
                  <select
                    className="w-full px-4 py-2.5 border-2 border-gray-100 rounded-xl bg-gray-50 font-bold text-sm outline-none focus:border-indigo-500 transition-colors"
                    value={settings.aspectRatio}
                    onChange={e => setSettings({ ...settings, aspectRatio: e.target.value as any })}
                  >
                    <option value="1:1">1:1 (Square)</option>
                    <option value="4:3">4:3 (Landscape)</option>
                    <option value="9:16">9:16 (Story)</option>
                    <option value="16:9">16:9 (Cinema)</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Quality</label>
                  <select
                    className="w-full px-4 py-2.5 border-2 border-gray-100 rounded-xl bg-gray-50 font-bold text-sm outline-none focus:border-indigo-500 transition-colors"
                    value={settings.imageSize}
                    onChange={e => setSettings({ ...settings, imageSize: e.target.value as any })}
                  >
                    <option value="1K">1080px (1K)</option>
                    <option value="2K">1440px (2K)</option>
                    <option value="4K">2160px (4K)</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Variations</label>
                <div className="flex gap-2">
                  {[1, 2, 3].map(n => (
                    <button
                      key={n}
                      onClick={() => setSettings({ ...settings, numberOfVariants: n })}
                      className={`flex-1 py-3 rounded-xl border-2 font-black text-xs uppercase tracking-widest transition-all ${
                        settings.numberOfVariants === n
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-md'
                          : 'bg-white text-gray-400 border-gray-100 hover:border-indigo-200'
                      }`}
                    >
                      {n} Image{n > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>
              {[
                { key: 'nyMode' as const, label: 'NY', description: 'Remove flavor imagery' },
                { key: 'resinRosinMode' as const, label: 'Resin/Rosin', description: 'Add weed leaves to imagery' }
              ].map(({ key, label, description }) => (
                <div key={key} className="flex items-center justify-between py-3 px-4 bg-gray-50 rounded-xl border-2 border-gray-100">
                  <div>
                    <label className="text-xs font-black text-gray-500 uppercase tracking-widest">{label}</label>
                    <p className="text-xs text-gray-400 mt-0.5">{description}</p>
                  </div>
                  <button
                    onClick={() => setSettings({ ...settings, [key]: !settings[key] })}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      settings[key] ? 'bg-indigo-600' : 'bg-gray-200'
                    }`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                      settings[key] ? 'translate-x-6' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
              ))}
              {settings.resinRosinMode && metadata && (
                <div className="py-3 px-4 bg-gray-50 rounded-xl border-2 border-gray-100">
                  <label className="text-xs font-black text-gray-500 uppercase tracking-widest">Strain Type</label>
                  <p className="text-xs text-gray-400 mt-0.5">Override auto-detected type for outline color</p>
                  <select
                    value={metadata?.strainType || ''}
                    onChange={e => setMetadata(prev => prev ? {...prev, strainType: (e.target.value as 'sativa' | 'hybrid' | 'indica') || undefined} : null)}
                    className="mt-2 w-full px-3 py-2 bg-white border-2 border-gray-200 rounded-lg text-sm font-medium"
                  >
                    <option value="">Auto-detect</option>
                    <option value="sativa">Sativa (Red outline)</option>
                    <option value="hybrid">Hybrid (Green outline)</option>
                    <option value="indica">Indica (Blue outline)</option>
                  </select>
                </div>
              )}
              <TextArea
                label="Additional Instructions"
                value={settings.additionalInstructions}
                onChange={e => setSettings({ ...settings, additionalInstructions: e.target.value })}
                placeholder="Add custom instructions for the image generation (e.g., 'Make the background more vibrant' or 'Add sparkle effects')"
              />
            </div>
          </section>

          <Button 
            className="w-full py-5 text-lg font-black uppercase tracking-widest shadow-2xl shadow-indigo-100 group relative overflow-hidden rounded-[2rem]" 
            onClick={handleGenerate} 
            isLoading={isGenerating} 
            disabled={!metadata || isAnalyzing}
          >
            <span className="relative z-10 flex items-center gap-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              {isGenerating ? "Processing..." : "Render Assets"}
            </span>
          </Button>
        </div>

        <div className="lg:col-span-8">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-3xl font-black text-gray-900 tracking-tighter">Shopify Ready Gallery</h2>
              <p className="text-sm text-gray-400 font-bold uppercase tracking-widest mt-1">Export high-resolution assets</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
            {isGenerating && (
              <div className="bg-white rounded-[2.5rem] p-8 shadow-2xl border border-indigo-50 animate-pulse h-[500px] flex flex-col items-center justify-center gap-8">
                <div className="w-full aspect-square bg-indigo-50/30 rounded-3xl flex items-center justify-center">
                  <div className="w-16 h-16 border-8 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                </div>
                <div className="space-y-4 w-full">
                  <div className="h-4 bg-indigo-50 rounded-full w-3/4 mx-auto" />
                </div>
              </div>
            )}

            {results.map((img) => (
              <div key={img.id} className="group bg-white rounded-[2.5rem] p-5 shadow-sm hover:shadow-2xl border border-gray-50 transition-all duration-700 relative flex flex-col">
                <div className="aspect-square relative overflow-hidden rounded-[1.5rem] bg-[#fafafa] border border-gray-100">
                  <img src={img.url} className="w-full h-full object-cover transition-transform duration-[2000ms] group-hover:scale-105" alt="Generated Ad" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex items-end p-6">
                    <Button 
                      className="w-full bg-white text-gray-900 py-3 font-black uppercase tracking-widest text-xs rounded-xl"
                      onClick={() => {
                        const link = document.createElement('a');
                        link.href = img.url;
                        link.download = `${metadata?.strainName || 'ad'}-${img.id}.png`;
                        link.click();
                      }}
                    >
                      Download (1080p)
                    </Button>
                  </div>
                </div>
                <div className="mt-4 flex items-center justify-between px-1">
                  <div>
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-widest block mb-0.5">Variant {img.id.slice(0, 4)}</span>
                    <h4 className="text-base font-black text-gray-800 tracking-tight">{metadata?.strainName}</h4>
                  </div>
                  <button onClick={() => {
                    revokeUrl(img.url);
                    setResults(prev => prev.filter(r => r.id !== img.id));
                  }} className="p-2 text-gray-300 hover:text-red-500 transition-colors">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}

            {results.length === 0 && !isGenerating && (
              <div className="col-span-2 h-[500px] bg-white rounded-[2.5rem] border-2 border-dashed border-gray-100 flex flex-col items-center justify-center text-center p-10">
                <div className="w-20 h-20 bg-gray-50 rounded-2xl flex items-center justify-center mb-6">
                  <svg className="w-10 h-10 text-gray-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-gray-800">No Assets Generated</h3>
                <p className="text-gray-400 mt-2 max-w-xs text-sm">Upload a product photo and click "Render Assets" to create professional marketing images.</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
