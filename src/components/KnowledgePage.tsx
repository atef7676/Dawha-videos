import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { populateKnowledgeBaseFromVideos, clearKnowledgeBase } from '../services/dataBridgeService';
import { 
  Search, BookOpen, ChevronLeft, Loader2, Share2, Download, 
  Twitter, Facebook, MessageCircle, Copy, Check, ExternalLink,
  ChevronRight, Info, Database, Layers, Filter, Edit3, Save, Trash2, Plus, ArrowRight
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toPng } from 'html-to-image';
import { quranService, Surah, Ayah, Tafseer } from '../services/quranService';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  orderBy, 
  doc, 
  updateDoc, 
  deleteDoc, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../firebase';
import { KnowledgeTopic, KnowledgeEntry, refreshTopicSummary, askKnowledgeBase } from '../services/knowledgeService';

interface KnowledgePageProps {
  onBack: () => void;
  initialSelection?: any;
  user?: import('firebase/auth').User | null;
}

type KBTab = 'topics' | 'quran' | 'taxonomy' | 'audit' | 'qa';

export default function KnowledgePage({ onBack, initialSelection, user }: KnowledgePageProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<KBTab>('topics');
  
  // Quran State
  const [surahs, setSurahs] = useState<Surah[]>([]);
  const [selectedSurah, setSelectedSurah] = useState<Surah | null>(null);
  const [ayahs, setAyahs] = useState<Ayah[]>([]);
  const [translations, setTranslations] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [activeTafseer, setActiveTafseer] = useState<{ ayah: number, data: Tafseer } | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  // Unified Knowledge State
  const [topics, setTopics] = useState<KnowledgeTopic[]>([]);
  const [selectedTopic, setSelectedTopic] = useState<KnowledgeTopic | null>(null);
  const [entries, setEntries] = useState<KnowledgeEntry[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [topicFilter, setTopicFilter] = useState('');
  const [qaQuery, setQaQuery] = useState('');
  const [qaResult, setQaResult] = useState<{
    answer: string;
    sources: { title: string; url?: string; type: string; content: string }[];
    followUpQuestions?: string[];
    debug?: {
      expandedQuery: string[];
      matchedTopics: string[];
      retrievedCount: number;
      confidence: string;
    };
  } | null>(null);
  const [isQaLoading, setIsQaLoading] = useState(false);
  const [isPopulating, setIsPopulating] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const isAdmin = user?.email === 'atefhassan76@gmail.com';

  const exportRef = useRef<HTMLDivElement>(null);
  const ayahRefs = useRef<{ [key: number]: HTMLDivElement | null }>({});

  useEffect(() => {
    const topicId = searchParams.get('topic');
    if (topicId && topics.length > 0) {
      const topic = topics.find(t => t.id === topicId);
      if (topic) {
        setSelectedTopic(topic);
      }
    } else if (!topicId) {
      setSelectedTopic(null);
    }
  }, [searchParams, topics]);

  useEffect(() => {
    const fetchSurahs = async () => {
      const data = await quranService.getSurahs();
      setSurahs(data);
    };
    fetchSurahs();
  }, []);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'knowledge_topics'),
      where('userId', '==', user.uid),
      orderBy('updatedAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeTopic));
      setTopics(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'knowledge_topics');
    });

    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!selectedTopic?.id) {
      setEntries([]);
      return;
    }

    const q = query(
      collection(db, 'knowledge_entries'),
      where('topicId', '==', selectedTopic.id),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeEntry));
      setEntries(list);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'knowledge_entries');
    });

    return () => unsubscribe();
  }, [selectedTopic]);

  const handleSurahSelect = async (surah: Surah) => {
    if (selectedSurah?.number === surah.number && ayahs.length > 0) return;
    setSelectedSurah(surah);
    setLoading(true);
    setSearchResults([]);
    setActiveTafseer(null);
    try {
      const [ayahData, transData] = await Promise.all([
        quranService.getSurahAyahs(surah.number),
        quranService.getSurahTranslation(surah.number)
      ]);
      setAyahs(ayahData);
      setTranslations(transData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshSummary = async () => {
    if (!selectedTopic?.id || !auth.currentUser) return;
    setIsRefreshing(true);
    try {
      await refreshTopicSummary(selectedTopic.id, auth.currentUser.uid);
    } catch (e) {
      console.error(e);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleUpdateEntry = async (entryId: string, content: string) => {
    await updateDoc(doc(db, 'knowledge_entries', entryId), { content });
  };

  const handleDeleteEntry = async (entryId: string) => {
    if (confirm('Delete this entry?')) {
      await deleteDoc(doc(db, 'knowledge_entries', entryId));
    }
  };

  const exportAsImage = async (ayah: Ayah, translation: string) => {
    if (!exportRef.current) return;
    setIsExporting(true);
    
    // Create a temporary element for export
    const exportEl = document.createElement('div');
    exportEl.style.position = 'fixed';
    exportEl.style.left = '-9999px';
    exportEl.style.width = '600px';
    exportEl.style.padding = '40px';
    exportEl.style.background = '#ffffff';
    exportEl.style.borderRadius = '24px';
    exportEl.style.fontFamily = "'Inter', sans-serif";
    exportEl.style.color = '#141414';
    exportEl.style.textAlign = 'center';
    
    exportEl.innerHTML = `
      <div style="margin-bottom: 24px; opacity: 0.4; font-size: 12px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.1em;">
        Surah ${selectedSurah?.englishName} | Ayah ${ayah.numberInSurah}
      </div>
      <div style="font-family: 'Amiri', serif; font-size: 32px; line-height: 1.8; margin-bottom: 32px; direction: rtl;">
        ${ayah.text}
      </div>
      <div style="font-size: 18px; line-height: 1.6; color: rgba(20, 20, 20, 0.7); font-style: italic;">
        "${translation}"
      </div>
      <div style="margin-top: 40px; padding-top: 24px; border-top: 1px solid rgba(20, 20, 20, 0.1); font-size: 10px; opacity: 0.3; font-weight: bold; text-transform: uppercase; letter-spacing: 0.2em;">
        Generated by Quran Explorer
      </div>
    `;
    
    document.body.appendChild(exportEl);
    
    try {
      const dataUrl = await toPng(exportEl, { quality: 0.95 });
      const link = document.createElement('a');
      link.download = `Ayah-${selectedSurah?.englishName}-${ayah.numberInSurah}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      console.error('Export failed', err);
    } finally {
      document.body.removeChild(exportEl);
      setIsExporting(false);
    }
  };

  const shareOnSocial = (platform: string, ayah: Ayah, translation: string) => {
    const text = `Surah ${selectedSurah?.englishName} [${selectedSurah?.number}:${ayah.numberInSurah}]: "${translation}"`;
    const url = window.location.href;
    
    let shareUrl = '';
    switch (platform) {
      case 'twitter':
        shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
        break;
      case 'facebook':
        shareUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`;
        break;
      case 'whatsapp':
        shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`;
        break;
      case 'copy':
        navigator.clipboard.writeText(text + ' ' + url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        return;
    }
    
    if (shareUrl) {
      window.open(shareUrl, '_blank');
    }
  };

  const handleQaSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!qaQuery.trim() || !auth.currentUser) return;

    setIsQaLoading(true);
    setQaResult(null);
    try {
      const result = await askKnowledgeBase(qaQuery, auth.currentUser.uid);
      setQaResult(result);
    } catch (err) {
      console.error('QA failed', err);
    } finally {
      setIsQaLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#141414] font-sans">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-[#141414]/5 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button 
              onClick={onBack}
              className="p-2 hover:bg-[#141414]/5 rounded-full transition-all"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-xl font-serif italic">Unified Knowledge Base</h1>
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Theological Insights & Scripture</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {isAdmin && (
              <div className="flex items-center gap-2">
                {confirmClear ? (
                  <div className="flex items-center gap-2 bg-red-50 p-1 rounded-full border border-red-100">
                    <span className="text-[8px] font-bold uppercase tracking-widest text-red-600 px-2">Confirm Clear?</span>
                    <button 
                      onClick={async () => {
                        if (user) {
                          setIsClearing(true);
                          try {
                            await clearKnowledgeBase(user.uid);
                            setConfirmClear(false);
                          } catch (e) {
                            console.error(e);
                          } finally {
                            setIsClearing(false);
                          }
                        }
                      }}
                      disabled={isClearing}
                      className="px-3 py-1 bg-red-600 text-white rounded-full text-[8px] font-bold uppercase tracking-widest hover:bg-red-700 transition-all disabled:opacity-50"
                    >
                      {isClearing ? 'Clearing...' : 'Yes, Delete'}
                    </button>
                    <button 
                      onClick={() => setConfirmClear(false)}
                      className="px-3 py-1 bg-white text-[#141414]/40 rounded-full text-[8px] font-bold uppercase tracking-widest hover:bg-[#141414]/5 transition-all"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={() => setConfirmClear(true)}
                    className="px-4 py-2 bg-red-50 text-red-600 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-red-100 transition-all flex items-center gap-2"
                  >
                    <Trash2 className="w-3 h-3" />
                    Clear KB
                  </button>
                )}
              </div>
            )}

            <div className="flex items-center bg-[#141414]/5 p-1 rounded-full">
            <button 
              onClick={() => setActiveTab('topics')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'topics' ? 'bg-white shadow-sm text-[#141414]' : 'text-[#141414]/40 hover:text-[#141414]'}`}
            >
              Unified Topics
            </button>
            <button 
              onClick={() => setActiveTab('quran')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'quran' ? 'bg-white shadow-sm text-[#141414]' : 'text-[#141414]/40 hover:text-[#141414]'}`}
            >
              Quran Explorer
            </button>
            <button 
              onClick={() => setActiveTab('qa')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'qa' ? 'bg-white shadow-sm text-[#141414]' : 'text-[#141414]/40 hover:text-[#141414]'}`}
            >
              Q&A
            </button>
            <button 
              onClick={() => setActiveTab('audit')}
              className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-widest transition-all ${activeTab === 'audit' ? 'bg-white shadow-sm text-[#141414]' : 'text-[#141414]/40 hover:text-[#141414]'}`}
            >
              Audit
            </button>
          </div>
        </div>

        <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-[#141414] text-white rounded-full flex items-center justify-center text-xs font-bold">
              UKB
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        {activeTab === 'topics' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            {/* Left: Topics List */}
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white rounded-3xl border border-[#141414]/5 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-160px)]">
                <div className="p-6 border-b border-[#141414]/5 bg-[#141414]/[0.02] flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[#141414]/60">Theological Topics</h2>
                  <span className="text-[10px] font-mono text-[#141414]/30">{topics.length} Total</span>
                </div>
                <div className="p-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/30" />
                    <input 
                      type="text" 
                      placeholder="Filter topics..."
                      value={topicFilter}
                      onChange={(e) => setTopicFilter(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-[#141414]/5 rounded-xl border-none text-xs focus:ring-1 focus:ring-[#141414]/10"
                    />
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                  {topics.length === 0 ? (
                    <div className="p-6 text-center space-y-4">
                      <div className="w-12 h-12 bg-[#141414]/5 rounded-full flex items-center justify-center mx-auto">
                        <Database className="w-6 h-6 text-[#141414]/20" />
                      </div>
                      <div className="space-y-1">
                        <h3 className="text-xs font-bold uppercase tracking-widest">Knowledge Base Empty</h3>
                        <p className="text-[10px] text-[#141414]/40">No theological topics have been indexed yet.</p>
                      </div>
                      <div className="pt-4 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/60">Suggested Actions:</p>
                        <button 
                          onClick={async () => {
                            if (auth.currentUser) {
                              setIsPopulating(true);
                              try {
                                await populateKnowledgeBaseFromVideos(auth.currentUser.uid);
                                alert('Knowledge Base population started.');
                              } catch (e) {
                                console.error(e);
                                alert('Failed to populate knowledge base.');
                              } finally {
                                setIsPopulating(false);
                              }
                            }
                          }}
                          disabled={isPopulating}
                          className="w-full px-4 py-2 bg-[#141414] text-white rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#141414]/90 transition-all disabled:opacity-50"
                        >
                          {isPopulating ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : 'Populate Knowledge Base'}
                        </button>
                        <button className="w-full px-4 py-2 bg-[#141414]/5 text-[#141414] rounded-xl text-[10px] font-bold uppercase tracking-widest hover:bg-[#141414]/10 transition-all">
                          Browse Indexed Materials
                        </button>
                      </div>
                    </div>
                  ) : (
                    topics.filter(t => 
                      t.title.toLowerCase().includes(topicFilter.toLowerCase()) || 
                      t.categories?.some(cat => cat.toLowerCase().includes(topicFilter.toLowerCase()))
                    ).map((topic) => (
                      <button
                        key={topic.id}
                        onClick={() => navigate(`/knowledge?topic=${topic.id}`)}
                        className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group ${selectedTopic?.id === topic.id ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5'}`}
                      >
                        <div className="text-left">
                          <p className="text-sm font-medium">{topic.title}</p>
                          <p className={`text-[10px] opacity-60 ${selectedTopic?.id === topic.id ? 'text-white/60' : ''}`}>
                            Last updated: {topic.updatedAt?.toDate().toLocaleDateString()}
                          </p>
                        </div>
                        <ChevronRight className={`w-4 h-4 transition-transform ${selectedTopic?.id === topic.id ? 'translate-x-1' : 'opacity-20 group-hover:opacity-100'}`} />
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>

            {/* Right: Topic Details */}
            <div className="lg:col-span-8">
              <AnimatePresence mode="wait">
                {selectedTopic ? (
                  <motion.div 
                    key={selectedTopic.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-[#141414]/5 relative overflow-hidden">
                      <div className="relative z-10">
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-4xl font-serif italic">{selectedTopic.title}</h2>
                          <button 
                            onClick={handleRefreshSummary}
                            disabled={isRefreshing}
                            className="flex items-center gap-2 px-4 py-2 bg-[#141414] text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-[#141414]/90 transition-all disabled:opacity-50"
                          >
                            {isRefreshing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Layers className="w-3 h-3" />}
                            Regenerate Summary
                          </button>
                        </div>
                        
                        <div className="prose prose-stone max-w-none">
                          <div className="text-sm text-[#141414]/70 leading-relaxed whitespace-pre-wrap">
                            {selectedTopic.description || "No summary available. Click 'Regenerate Summary' to synthesize insights."}
                          </div>
                        </div>

                        {selectedTopic.cross_faith_comparisons && (
                          <div className="mt-8 p-6 bg-stone-50 rounded-2xl border border-stone-200/50">
                            <h4 className="text-[10px] font-bold uppercase tracking-widest text-stone-400 mb-3">Cross-Faith Comparison</h4>
                            <p className="text-sm text-stone-600 leading-relaxed italic">{selectedTopic.cross_faith_comparisons}</p>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 px-4">Evidence & Sources ({entries.length})</h3>
                      <div className="grid grid-cols-1 gap-4">
                        {entries.map((entry) => (
                          <div key={entry.id} className="bg-white p-6 rounded-3xl border border-[#141414]/5 shadow-sm group">
                            <div className="flex items-center justify-between mb-4">
                              <div className="flex items-center gap-3">
                                <span className={`px-2 py-1 rounded-md text-[8px] font-bold uppercase tracking-widest ${
                                  entry.sourceType === 'video' ? 'bg-red-50 text-red-600' : 
                                  entry.sourceType === 'scripture' ? 'bg-emerald-50 text-emerald-600' : 
                                  'bg-blue-50 text-blue-600'
                                }`}>
                                  {entry.sourceType}
                                </span>
                                {entry.speaker && (
                                  <span className="text-[10px] font-medium text-[#141414]/40">Speaker: {entry.speaker}</span>
                                )}
                              </div>
                              {entry.metadata?.videoUrl && (
                                <a 
                                  href={entry.metadata.videoUrl} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/30 hover:text-[#141414] flex items-center gap-1"
                                >
                                  Source <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                              {entry.metadata?.externalLink && (
                                <a 
                                  href={entry.metadata.externalLink} 
                                  target="_blank" 
                                  rel="noreferrer"
                                  className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/60 hover:text-emerald-600 flex items-center gap-1"
                                >
                                  View Scripture <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>
                            <p className="text-sm text-[#141414]/80 leading-relaxed">{entry.content}</p>
                            <div className="mt-4 pt-4 border-t border-[#141414]/5 flex items-center justify-between">
                              <span className="text-[10px] font-mono text-[#141414]/20">
                                {entry.createdAt?.toDate().toLocaleDateString()}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <div className="h-[calc(100vh-160px)] flex flex-col items-center justify-center text-center space-y-8">
                    <div className="w-32 h-32 bg-white rounded-[3rem] shadow-xl flex items-center justify-center">
                      <Database className="w-12 h-12 text-[#141414]/10" />
                    </div>
                    <div className="max-w-md">
                      <h2 className="text-3xl font-serif italic text-[#141414] mb-4">Unified Knowledge Base</h2>
                      <p className="text-sm text-[#141414]/40 leading-relaxed">
                        Select a topic from the library to view synthesized theological insights, cross-faith comparisons, and linked evidence from all indexed videos and texts.
                      </p>
                    </div>
                  </div>
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {activeTab === 'quran' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <div className="lg:col-span-4 space-y-4">
              <div className="bg-white rounded-3xl border border-[#141414]/5 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-160px)]">
                <div className="p-6 border-b border-[#141414]/5 bg-[#141414]/[0.02] flex items-center justify-between">
                  <h2 className="text-xs font-bold uppercase tracking-widest text-[#141414]/60">Surahs</h2>
                  <span className="text-[10px] font-mono text-[#141414]/30">114 Total</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
                  {surahs.map((surah) => (
                    <button
                      key={surah.number}
                      onClick={() => handleSurahSelect(surah)}
                      className={`w-full flex items-center justify-between p-4 rounded-2xl transition-all group ${selectedSurah?.number === surah.number ? 'bg-[#141414] text-white shadow-lg' : 'hover:bg-[#141414]/5'}`}
                    >
                      <div className="flex items-center gap-4">
                        <span className={`text-[10px] font-mono w-8 h-8 flex items-center justify-center rounded-full border ${selectedSurah?.number === surah.number ? 'border-white/20' : 'border-[#141414]/10'}`}>
                          {surah.number}
                        </span>
                        <div className="text-left">
                          <p className="text-sm font-medium">{surah.englishName}</p>
                          <p className={`text-[10px] opacity-60 ${selectedSurah?.number === surah.number ? 'text-white/60' : ''}`}>{surah.englishNameTranslation}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-arabic text-lg opacity-80">{surah.name}</p>
                        <p className="text-[8px] uppercase tracking-tighter opacity-40">{surah.numberOfAyahs} Ayahs</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="lg:col-span-8">
              {selectedSurah ? (
                <div className="space-y-6">
                  <div className="bg-[#141414] text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row md:items-end justify-between gap-6">
                      <div>
                        <h2 className="text-5xl font-serif italic mb-2">{selectedSurah.englishName}</h2>
                        <p className="text-sm font-medium opacity-60">{selectedSurah.englishNameTranslation}</p>
                      </div>
                      <p className="text-6xl font-arabic">{selectedSurah.name}</p>
                    </div>
                  </div>
                  <div className="space-y-6 h-[calc(100vh-360px)] overflow-y-auto pr-2 custom-scrollbar pb-20">
                    {ayahs.map((ayah, idx) => (
                      <div key={ayah.number} className="bg-white p-8 rounded-[2.5rem] border border-[#141414]/5 shadow-sm space-y-6">
                        <p className="text-right font-arabic text-4xl leading-[2]">{ayah.text}</p>
                        <p className="text-xl text-[#141414]/80 italic">"{translations[idx]}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="h-[calc(100vh-160px)] flex flex-col items-center justify-center text-center space-y-8">
                  <BookOpen className="w-12 h-12 text-[#141414]/10" />
                  <h2 className="text-3xl font-serif italic text-[#141414]">Select a Surah</h2>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'qa' && (
          <div className="max-w-4xl mx-auto space-y-8">
            <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-[#141414]/5">
              <h2 className="text-3xl font-serif italic mb-6">Knowledge Q&A</h2>
              <p className="text-sm text-[#141414]/60 mb-8">
                Ask questions grounded exclusively in your unified knowledge base. 
                The system uses semantic search to find the most relevant theological segments and video transcripts.
              </p>

              <form onSubmit={handleQaSubmit} className="relative">
                <input 
                  type="text" 
                  value={qaQuery}
                  onChange={(e) => setQaQuery(e.target.value)}
                  placeholder="Ask a theological question..."
                  className="w-full pl-6 pr-16 py-4 bg-[#141414]/5 rounded-2xl border-none text-sm focus:ring-1 focus:ring-[#141414]/10"
                />
                <button 
                  type="submit"
                  disabled={isQaLoading || !qaQuery.trim()}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-3 bg-[#141414] text-white rounded-xl hover:bg-[#141414]/90 transition-all disabled:opacity-50"
                >
                  {isQaLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                </button>
              </form>
            </div>

            <AnimatePresence mode="wait">
              {isQaLoading ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="flex flex-col items-center justify-center py-20 space-y-4"
                >
                  <Loader2 className="w-8 h-8 animate-spin text-[#141414]/20" />
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Searching Knowledge Base...</p>
                </motion.div>
              ) : qaResult ? (
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-8"
                >
                  {/* Answer Section */}
                  <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-[#141414]/5">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-6 h-6 bg-[#141414] text-white rounded-full flex items-center justify-center text-[10px] font-bold">A</div>
                        <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">Synthesized Answer</h3>
                      </div>
                      {qaResult.debug && (
                        <div className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest ${
                          qaResult.debug.confidence === 'High' ? 'bg-emerald-100 text-emerald-600' :
                          qaResult.debug.confidence === 'Medium' ? 'bg-amber-100 text-amber-600' :
                          'bg-rose-100 text-rose-600'
                        }`}>
                          Confidence: {qaResult.debug.confidence}
                        </div>
                      )}
                    </div>
                    <div className="prose prose-stone max-w-none">
                      <div className="text-lg text-[#141414] leading-relaxed whitespace-pre-wrap">
                        {qaResult.answer}
                      </div>
                    </div>

                    {qaResult.followUpQuestions && qaResult.followUpQuestions.length > 0 && (
                      <div className="mt-10 pt-8 border-t border-[#141414]/5">
                        <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-4">Follow-up Questions</h4>
                        <div className="flex flex-wrap gap-2">
                          {qaResult.followUpQuestions.map((q, i) => (
                            <button 
                              key={i}
                              onClick={() => {
                                setQaQuery(q);
                                // Trigger search manually
                                setTimeout(() => {
                                  const form = document.querySelector('form');
                                  form?.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                                }, 100);
                              }}
                              className="px-4 py-2 bg-[#141414]/5 hover:bg-[#141414]/10 rounded-full text-xs transition-all"
                            >
                              {q}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Debug Panel */}
                  {qaResult.debug && (
                    <div className="bg-[#141414] text-white/90 p-8 rounded-[2.5rem] shadow-xl space-y-6">
                      <div className="flex items-center gap-2 mb-2">
                        <Database className="w-4 h-4 text-emerald-400" />
                        <h3 className="text-[10px] font-bold uppercase tracking-widest text-white/40">Semantic Retrieval Debug</h3>
                      </div>
                      
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/20">Expanded Query</h4>
                          <div className="flex flex-wrap gap-2">
                            {qaResult.debug.expandedQuery.map((term, i) => (
                              <span key={i} className="px-2 py-1 bg-white/5 rounded-md text-[10px] font-mono">{term}</span>
                            ))}
                          </div>
                        </div>
                        
                        <div className="space-y-3">
                          <h4 className="text-[10px] font-bold uppercase tracking-widest text-white/20">Matched Topics</h4>
                          <div className="flex flex-wrap gap-2">
                            {qaResult.debug.matchedTopics.length > 0 ? (
                              qaResult.debug.matchedTopics.map((topic, i) => (
                                <span key={i} className="px-2 py-1 bg-emerald-500/10 text-emerald-400 rounded-md text-[10px] font-bold uppercase tracking-widest">{topic}</span>
                              ))
                            ) : (
                              <span className="text-[10px] text-white/20 italic">None</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pt-4 border-t border-white/5 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="text-center">
                            <p className="text-xl font-serif italic text-emerald-400">{qaResult.debug.retrievedCount}</p>
                            <p className="text-[8px] font-bold uppercase tracking-widest text-white/20">Segments Retrieved</p>
                          </div>
                          <div className="w-px h-8 bg-white/5" />
                          <div className="text-center">
                            <p className="text-xl font-serif italic text-emerald-400">{qaResult.debug.confidence}</p>
                            <p className="text-[8px] font-bold uppercase tracking-widest text-white/20">AI Confidence</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[8px] font-bold uppercase tracking-widest text-white/20">Engine Status</p>
                          <p className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">Production Optimized</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sources Section */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 px-4">Retrieved Sources ({qaResult.sources.length})</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {qaResult.sources.map((source, i) => (
                        <div key={i} className="bg-white p-6 rounded-3xl border border-[#141414]/5 shadow-sm space-y-3">
                          <div className="flex items-center justify-between">
                            <span className={`px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-widest ${
                              source.type === 'video' ? 'bg-blue-100 text-blue-600' : 
                              source.type === 'scripture' ? 'bg-emerald-100 text-emerald-600' : 
                              'bg-stone-100 text-stone-600'
                            }`}>
                              {source.type}
                            </span>
                            {source.url && (
                              <a 
                                href={source.url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="p-1.5 hover:bg-[#141414]/5 rounded-full transition-all"
                              >
                                <ExternalLink className="w-3 h-3 text-[#141414]/40" />
                              </a>
                            )}
                          </div>
                          <h4 className="text-xs font-bold line-clamp-1">{source.title}</h4>
                          <p className="text-[11px] text-[#141414]/60 line-clamp-3 italic">"{source.content}"</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
          </div>
        )}

        {activeTab === 'audit' && (
          <div className="space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-serif italic">Review & Audit Interface</h2>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Filter by:</span>
                <select className="bg-white border border-[#141414]/10 rounded-full px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest">
                  <option>All Entries</option>
                  <option>Pending Review</option>
                  <option>High Confidence</option>
                  <option>Low Confidence</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6">
              {topics.map(topic => (
                <div key={topic.id} className="bg-white rounded-[2.5rem] border border-[#141414]/5 shadow-sm overflow-hidden">
                  <div className="p-8 bg-[#141414]/[0.02] border-b border-[#141414]/5 flex items-center justify-between">
                    <div>
                      <h3 className="text-lg font-serif italic">{topic.title}</h3>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Topic ID: {topic.id}</p>
                    </div>
                    <button className="p-2 hover:bg-[#141414]/5 rounded-full transition-all">
                      <Edit3 className="w-4 h-4 text-[#141414]/40" />
                    </button>
                  </div>
                  <div className="p-8 space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Categories</label>
                        <div className="flex flex-wrap gap-2">
                          {topic.categories?.map(c => (
                            <span key={c} className="px-3 py-1 bg-[#141414]/5 rounded-full text-[10px] font-bold">{c}</span>
                          ))}
                          <button className="w-6 h-6 flex items-center justify-center bg-[#141414]/5 rounded-full hover:bg-[#141414]/10 transition-all">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Related Scriptures</label>
                        <div className="flex flex-wrap gap-2">
                          {topic.related_scriptures?.map(s => (
                            <span key={s} className="px-3 py-1 bg-stone-100 rounded-full text-[10px] font-mono">{s}</span>
                          ))}
                          <button className="w-6 h-6 flex items-center justify-center bg-[#141414]/5 rounded-full hover:bg-[#141414]/10 transition-all">
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">Unified Description</label>
                      <textarea 
                        className="w-full h-32 p-4 bg-[#141414]/5 rounded-2xl border-none text-sm focus:ring-1 focus:ring-[#141414]/10"
                        defaultValue={topic.description}
                      />
                    </div>

                    <div className="flex items-center justify-end gap-3 pt-4">
                      <button className="flex items-center gap-2 px-6 py-2 border border-[#141414]/10 rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-[#141414]/5 transition-all">
                        Discard Changes
                      </button>
                      <button className="flex items-center gap-2 px-6 py-2 bg-[#141414] text-white rounded-full text-[10px] font-bold uppercase tracking-widest hover:bg-[#141414]/90 transition-all">
                        <Save className="w-3 h-3" />
                        Save Refinement
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar {
          width: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(20, 20, 20, 0.05);
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(20, 20, 20, 0.1);
        }
        @import url('https://fonts.googleapis.com/css2?family=Amiri:ital,wght@0,400;0,700;1,400;1,700&display=swap');
        .font-arabic {
          font-family: 'Amiri', serif;
        }
      `}</style>
    </div>
  );
}
