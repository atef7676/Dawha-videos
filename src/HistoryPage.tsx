import React from 'react';
import { Download, Trash2, FileJson, History as HistoryIcon, Database, Loader2 } from 'lucide-react';

export default function HistoryPage({ videos, selectedHistoryVideos, toggleHistorySelection, deleteVideo, setExportTarget, setShowExportModal, rebuildIndex, isRebuildingIndex, t }: any) {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end pb-4 border-b border-[#141414]/10">
        <div className="flex items-center gap-2">
          <HistoryIcon className="w-4 h-4 text-[#141414]/40" />
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-[#141414]/40">{t.archive}</h2>
        </div>
        <div className="flex gap-4 items-center">
          <button 
            onClick={rebuildIndex}
            disabled={isRebuildingIndex || videos.length === 0}
            className={`text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5 transition-colors ${
              isRebuildingIndex ? 'text-amber-600' : 'text-[#141414]/60 hover:text-[#141414]'
            }`}
          >
            {isRebuildingIndex ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin" />
                Rebuilding Index...
              </>
            ) : (
              <>
                <Database className="w-3 h-3" />
                Rebuild Search Index
              </>
            )}
          </button>
          <div className="w-px h-3 bg-[#141414]/10" />
          {selectedHistoryVideos.length > 0 && (
            <button 
              onClick={() => { 
                setExportTarget(videos.filter((v: any) => selectedHistoryVideos.includes(v.id))); 
                setShowExportModal(true); 
              }}
              className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5 text-[#141414]/60 hover:text-[#141414] transition-colors"
            >
              <FileJson className="w-3 h-3" /> {t.exportSelection} ({selectedHistoryVideos.length})
            </button>
          )}
          <button 
            onClick={() => { setExportTarget(videos as any); setShowExportModal(true); }}
            className="text-[10px] uppercase tracking-wider font-bold flex items-center gap-1.5 text-[#141414]/60 hover:text-[#141414] transition-colors"
          >
            <Download className="w-3 h-3" /> {t.exportAll}
          </button>
        </div>
      </div>

      {videos.length === 0 ? (
        <div className="py-12 text-center border-2 border-dashed border-[#141414]/5 rounded-xl">
          <p className="text-xs text-[#141414]/30 font-mono tracking-tight uppercase">{t.noRecordsFound}</p>
        </div>
      ) : (
        <div className="grid gap-3">
          {videos.map((video: any) => (
            <div 
              key={video.id} 
              className="group relative flex items-center justify-between p-4 bg-white rounded-xl border border-[#141414]/5 hover:border-[#141414]/20 transition-all duration-300 hover:shadow-sm"
            >
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="relative flex items-center justify-center">
                  <input 
                    type="checkbox" 
                    checked={selectedHistoryVideos.includes(video.id)}
                    onChange={() => toggleHistorySelection(video.id)}
                    className="w-4 h-4 rounded border-[#141414]/20 text-[#141414] focus:ring-[#141414] cursor-pointer"
                  />
                </div>
                
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="text-sm font-serif italic text-[#141414] truncate group-hover:text-[#141414] transition-colors">
                    {video.title}
                  </span>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#141414]/40">
                      {video.speaker_name || t.unknownSpeaker}
                    </span>
                    <span className="text-[#141414]/10">•</span>
                    <span className="text-[10px] uppercase tracking-wider font-bold text-[#141414]/40 truncate">
                      {video.channel_name || t.unknownChannel}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button 
                  onClick={() => { setExportTarget(video); setShowExportModal(true); }} 
                  className="p-2 hover:bg-[#141414]/5 rounded-lg transition-colors group/btn"
                  title={t.exportJson}
                >
                  <FileJson className="w-4 h-4 text-[#141414]/40 group-hover/btn:text-[#141414]" />
                </button>
                <button 
                  onClick={() => deleteVideo(video.id)} 
                  className="p-2 hover:bg-red-50 rounded-lg transition-colors group/del"
                  title={t.deleteRecord}
                >
                  <Trash2 className="w-4 h-4 text-red-500/40 group-hover/del:text-red-500" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
