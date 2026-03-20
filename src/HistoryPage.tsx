import React from 'react';
import { Download, Trash2 } from 'lucide-react';

export default function HistoryPage({ videos, selectedHistoryVideos, toggleHistorySelection, deleteVideo, setExportTarget, setShowExportModal }: any) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">History</h2>
        <div className="flex gap-2">
          {selectedHistoryVideos.length > 0 && (
            <button 
              onClick={() => { 
                setExportTarget(videos.filter((v: any) => selectedHistoryVideos.includes(v.id))); 
                setShowExportModal(true); 
              }}
              className="text-xs flex items-center gap-1 text-[#141414]/60 hover:text-[#141414]"
            >
              <Download className="w-3 h-3" /> Export Selected
            </button>
          )}
          <button 
            onClick={() => { setExportTarget(videos as any); setShowExportModal(true); }}
            className="text-xs flex items-center gap-1 text-[#141414]/60 hover:text-[#141414]"
          >
            <Download className="w-3 h-3" /> Export All
          </button>
        </div>
      </div>
      {videos.length === 0 ? (
        <p className="text-sm text-[#141414]/40 italic">No history yet.</p>
      ) : (
        videos.map((video: any) => (
          <div key={video.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-[#141414]/5">
            <label className="flex items-center gap-3 flex-1 mr-2 cursor-pointer">
              <input 
                type="checkbox" 
                checked={selectedHistoryVideos.includes(video.id)}
                onChange={() => toggleHistorySelection(video.id)}
                className="w-4 h-4 accent-[#141414]"
              />
              <span className="text-sm truncate">{video.title}</span>
            </label>
            <button onClick={() => { setExportTarget(video); setShowExportModal(true); }} className="p-1 hover:bg-[#141414]/5 rounded">
              <Download className="w-4 h-4 text-[#141414]/40" />
            </button>
            <button onClick={() => deleteVideo(video.id)} className="p-1 hover:bg-red-50 rounded">
              <Trash2 className="w-4 h-4 text-red-500/40" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}
