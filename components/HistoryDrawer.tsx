
import React from 'react';
import { HistoryItem } from '../types';
import { Button } from './Button';

interface HistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  items: HistoryItem[];
  onRestore: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  onClose,
  items,
  onRestore,
  onDelete,
  onClearAll
}) => {
  return (
    <>
      {/* Backdrop */}
      <div 
        className={`fixed inset-0 bg-gray-900/60 backdrop-blur-md z-40 transition-opacity duration-500 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      
      {/* Drawer */}
      <div className={`fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-2xl z-50 transform transition-transform duration-700 ease-in-out flex flex-col rounded-l-[3rem] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-10 border-b border-gray-50 flex items-center justify-between">
          <div>
            <h2 className="text-3xl font-black text-gray-900 tracking-tighter">Library</h2>
            <div className="flex items-center gap-2 mt-1">
              <span className="w-2 h-2 bg-green-500 rounded-full" />
              <p className="text-[10px] text-gray-400 font-black uppercase tracking-[0.2em]">{items.length} Permanent Projects</p>
            </div>
          </div>
          <button onClick={onClose} className="p-3 bg-gray-50 text-gray-400 hover:text-indigo-600 rounded-2xl transition-all">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-8 space-y-6">
          {items.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center p-12 opacity-30">
              <div className="bg-gray-100 p-8 rounded-[2rem] mb-6">
                <svg className="w-16 h-16 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <p className="font-black text-gray-900 uppercase tracking-widest text-xs">Storage Empty</p>
              <p className="text-sm font-medium mt-2">Saved generations will persist here across sessions.</p>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="group relative bg-white border border-gray-100 rounded-[2rem] p-4 shadow-sm hover:shadow-xl transition-all duration-500 hover:-translate-y-1">
                <div className="flex gap-6">
                  <div className="w-28 h-28 rounded-2xl overflow-hidden bg-gray-50 border border-gray-100 flex-shrink-0 shadow-inner">
                    <img 
                      src={item.thumbnail || item.variants[0]?.url} 
                      className="w-full h-full object-cover" 
                      alt="Thumbnail" 
                    />
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div>
                      <h3 className="font-black text-gray-900 truncate text-lg tracking-tight leading-none mb-1">{item.metadata.strainName || 'Untitled'}</h3>
                      <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest">{item.metadata.fruitFlavor}</p>
                      <p className="text-[10px] text-gray-400 font-bold mt-2">
                        {new Date(item.timestamp).toLocaleDateString()} • {item.settings.imageSize}
                      </p>
                    </div>
                    <div className="flex gap-2 mt-4">
                      <Button variant="secondary" className="text-[10px] py-1.5 px-4 h-8 font-black uppercase tracking-widest rounded-xl" onClick={() => onRestore(item)}>
                        Load
                      </Button>
                      <button 
                        onClick={() => onDelete(item.id)}
                        className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {items.length > 0 && (
          <div className="p-10 border-t border-gray-50 bg-gray-50/50">
            <Button 
              variant="danger" 
              className="w-full py-4 font-black uppercase text-xs tracking-[0.3em] rounded-2xl shadow-lg shadow-red-100" 
              onClick={onClearAll}
            >
              Flush Storage
            </Button>
          </div>
        )}
      </div>
    </>
  );
};
