/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, Plus, Video, Clock, ChevronRight, Loader2, Play, ExternalLink, Database, Download, X, Trash2, LogIn, LogOut, User, BookOpen, ArrowLeft, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import HistoryPage from './HistoryPage';
import { analyzeTranscript, generateAltTranscript, translateVideoAnalysis, Segment, VideoAnalysis } from './services/geminiService';
import { db, auth, handleFirestoreError, OperationType } from './firebase';
import { 
  collection, 
  query, 
  where, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  getDocs, 
  setDoc,
  serverTimestamp,
  Timestamp,
  getDocFromServer
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User as FirebaseUser
} from 'firebase/auth';

interface IndexedVideo {
  id: string; // Firestore document ID
  youtube_id: string;
  title: string;
  url: string;
  executive_summary: string;
  linkable_timestamps: { 
    time: string; 
    description: string; 
    scripture_references?: import('./services/geminiService').ScriptureReference[];
  }[];
  themes_and_topics: { overarching_message: string; categories: string[] };
  key_points: string[];
  keywords: string[];
  created_at: any;
  speaker_name?: string;
  channel_name?: string;
  video_timestamp?: string;
  token_count?: number;
  userId: string;
  transcript?: string;
  channel_url?: string;
  minute_by_minute?: { timestamp: string; content: string }[];
  theological_topics?: string[];
  scripture_references?: import('./services/geminiService').ScriptureReference[];
  all_scripture_references?: import('./services/geminiService').ScriptureReference[];
  entities?: string[];
  arguments?: import('./services/geminiService').Argument[];
  debate_claims?: import('./services/geminiService').Argument[];
}

interface SearchResult extends Segment {
  video_title: string;
  youtube_id: string;
  video_url: string;
  speaker_name?: string;
  channel_name?: string;
}

const extractYoutubeId = (url: string) => {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  return (match && match[2].length === 11) ? match[2] : url;
};

const getCleanYoutubeUrl = (url: string) => {
  const id = extractYoutubeId(url);
  if (id === url) return url;
  return `https://www.youtube.com/watch?v=${id}`;
};

type Language = 'en' | 'ar';

const translations = {
  en: {
    title: "Theological Video Indexer",
    subtitle: "Advanced analysis for Dawah and Interfaith debate",
    searchPlaceholder: "Search topics, speakers, or scripture...",
    addVideo: "Add Video",
    processVideo: "Process Video",
    processing: "Processing...",
    library: "Video Library",
    searchResults: "Search Results",
    noVideos: "No videos indexed yet. Add your first video to get started.",
    noResults: "No results found for your search.",
    backToLibrary: "Back to Library",
    viewFullAnalysis: "View Full Analysis",
    viewOnYoutube: "View on YouTube",
    executiveSummary: "Executive Summary",
    keyPoints: "Key Points",
    theologicalTopics: "Theological Topics",
    scriptureReferences: "Scripture References",
    transcript: "Transcript",
    minuteByMinute: "Minute-by-Minute Breakdown",
    entities: "Entities",
    logicalArguments: "Logical Arguments",
    debateClaims: "Debate Claims",
    translate: "Auto-Translate Content",
    switchLang: "العربية",
    login: "Sign in with Google",
    logout: "Sign Out",
    history: "History",
    allReferences: "All Scripture References",
    keywords: "Keywords",
    categories: "Categories",
    overarchingMessage: "Overarching Message",
    readyToIndex: "Ready to index?",
    pasteUrlInstruction: "Paste a YouTube URL to transcribe and identify topics, or search your library for specific discussions.",
    exportData: "Export Data",
    selectFormat: "Select file format",
    exportDescription: "The exported file will contain all metadata and analysis.",
    tryDifferentSearch: "Try a different search query or index a new video.",
    single: "Single",
    batch: "Batch",
    archive: "Archive",
    exportSelection: "Export Selection",
    exportAll: "Export All",
    noRecordsFound: "No records found in archive",
    unknownSpeaker: "Unknown Speaker",
    unknownChannel: "Unknown Channel",
    exportJson: "Export JSON",
    deleteRecord: "Delete Record",
    speaker: "Speaker",
    channel: "Channel",
    timestamp: "Timestamp",
    description: "Description",
    reference: "Reference",
    type: "Type",
    matchType: "Match Type",
    confidence: "Confidence",
    evidence: "Evidence",
    explanation: "Explanation",
    verseText: "Verse Text",
    surah: "Surah",
    ayah: "Ayah",
    book: "Book",
    chapter: "Chapter",
    verse: "Verse",
    analyzing: "Analyzing content...",
    error: "Error processing video",
    invalidUrl: "Please enter a valid YouTube URL",
    alreadyIndexed: "This video is already in your library",
    linkableTimestamps: "Linkable Timestamps",
  },
  ar: {
    title: "فهرس الفيديوهات اللاهوتية",
    subtitle: "تحليل متقدم للدعوة والمناظرات بين الأديان",
    searchPlaceholder: "ابحث عن المواضيع، المتحدثين، أو المراجع...",
    addVideo: "إضافة فيديو",
    processVideo: "معالجة الفيديو",
    processing: "جاري المعالجة...",
    library: "مكتبة الفيديوهات",
    searchResults: "نتائج البحث",
    noVideos: "لم يتم فهرسة أي فيديوهات بعد. أضف فيديوك الأول للبدء.",
    noResults: "لم يتم العثور على نتائج لبحثك.",
    backToLibrary: "العودة للمكتبة",
    viewFullAnalysis: "عرض التحليل الكامل",
    viewOnYoutube: "عرض على يوتيوب",
    executiveSummary: "ملخص تنفيذي",
    keyPoints: "نقاط رئيسية",
    theologicalTopics: "مواضيع لاهوتية",
    scriptureReferences: "مراجع دينية",
    transcript: "النص الكامل",
    minuteByMinute: "تفصيل دقيقة بدقيقة",
    entities: "الكيانات",
    logicalArguments: "الحجج المنطقية",
    debateClaims: "ادعاءات المناظرة",
    translate: "ترجمة تلقائية للمحتوى",
    switchLang: "English",
    login: "تسجيل الدخول بجوجل",
    logout: "تسجيل الخروج",
    history: "السجل",
    allReferences: "جميع المراجع الدينية",
    keywords: "الكلمات المفتاحية",
    categories: "التصنيفات",
    overarchingMessage: "الرسالة العامة",
    readyToIndex: "جاهز للفهرسة؟",
    pasteUrlInstruction: "الصق رابط يوتيوب لنسخ المحتوى وتحديد المواضيع، أو ابحث في مكتبتك عن مناقشات محددة.",
    exportData: "تصدير البيانات",
    selectFormat: "اختر تنسيق الملف",
    exportDescription: "سيحتوي الملف المصدر على جميع البيانات والتحليلات.",
    tryDifferentSearch: "جرب استعلام بحث مختلف أو قم بفهرسة فيديو جديد.",
    single: "فردي",
    batch: "دفعة",
    archive: "الأرشيف",
    exportSelection: "تصدير المحدد",
    exportAll: "تصدير الكل",
    noRecordsFound: "لم يتم العثور على سجلات في الأرشيف",
    unknownSpeaker: "متحدث غير معروف",
    unknownChannel: "قناة غير معروفة",
    exportJson: "تصدير JSON",
    deleteRecord: "حذف السجل",
    speaker: "المتحدث",
    channel: "القناة",
    timestamp: "الطابع الزمني",
    description: "الوصف",
    reference: "المرجع",
    type: "النوع",
    matchType: "نوع المطابقة",
    confidence: "الثقة",
    evidence: "الدليل",
    explanation: "الشرح",
    verseText: "نص الآية",
    surah: "السورة",
    ayah: "الآية",
    book: "الكتاب",
    chapter: "الإصحاح",
    verse: "العدد",
    analyzing: "جاري تحليل المحتوى...",
    error: "خطأ في معالجة الفيديو",
    invalidUrl: "يرجى إدخال رابط يوتيوب صحيح",
    alreadyIndexed: "هذا الفيديو موجود بالفعل في مكتبتك",
    linkableTimestamps: "طوابع زمنية قابلة للربط",
  }
};

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean, error: any }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }

  componentDidCatch(error: any, errorInfo: any) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "Something went wrong.";
      try {
        const parsed = JSON.parse(this.state.error.message);
        errorMessage = `Firestore Error: ${parsed.error} during ${parsed.operationType} on ${parsed.path}`;
      } catch (e) {
        errorMessage = this.state.error.message || errorMessage;
      }

      return (
        <div className="min-h-screen bg-[#F5F5F0] flex items-center justify-center p-4">
          <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center">
            <X className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-[#141414] mb-2">Application Error</h2>
            <p className="text-[#141414]/60 mb-6">{errorMessage}</p>
            <button 
              onClick={() => window.location.reload()}
              className="w-full py-3 bg-[#141414] text-white rounded-xl font-medium hover:bg-[#141414]/90 transition-all"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default function App() {
  const [language, setLanguage] = useState<Language>('en');
  const [isTranslating, setIsTranslating] = useState(false);
  const t = translations[language];

  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [url, setUrl] = useState('');
  const [forceIndex, setForceIndex] = useState(false);
  const [channelUrl, setChannelUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stopRequested, setStopRequested] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [isFetchingChannel, setIsFetchingChannel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [videos, setVideos] = useState<IndexedVideo[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchOnlyScriptures, setSearchOnlyScriptures] = useState(false);
  const [selectedVideo, setSelectedVideo] = useState<IndexedVideo | null>(null);
  const [videoSegments, setVideoSegments] = useState<Segment[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'single' | 'channel' | 'history'>('single');
  const [currentPage, setCurrentPage] = useState<'main' | 'history'>('main');
  const [channelVideos, setChannelVideos] = useState<any[]>([]);
  const [channelPage, setChannelPage] = useState(1);
  const [selectedChannelVideos, setSelectedChannelVideos] = useState<string[]>([]);
  const [selectedHistoryVideos, setSelectedHistoryVideos] = useState<string[]>([]);
  const [tokenCount, setTokenCount] = useState(0);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportTarget, setExportTarget] = useState<IndexedVideo | IndexedVideo[] | null>(null);
  const [showTranscript, setShowTranscript] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user) {
      setVideos([]);
      return;
    }

    const q = query(
      collection(db, 'videos'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const videoList = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as IndexedVideo[];
      setVideos(videoList);
    }, (err) => {
      handleFirestoreError(err, OperationType.LIST, 'videos');
    });

    return () => unsubscribe();
  }, [user]);

  const signIn = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setSelectedVideo(null);
      setVideoSegments([]);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const testConnection = async () => {
    try {
      await getDocFromServer(doc(db, 'test', 'connection'));
    } catch (error) {
      if(error instanceof Error && error.message.includes('the client is offline')) {
        console.error("Please check your Firebase configuration. ");
      }
    }
  };

  useEffect(() => {
    if (isAuthReady) {
      testConnection();
    }
  }, [isAuthReady]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    
    const query = searchQuery.toLowerCase();
    const results: SearchResult[] = [];

    // Search through videos and their metadata
    videos.forEach(video => {
      const scriptureMatches = video.all_scripture_references?.filter(ref => 
        ref.reference.toLowerCase().includes(query) || 
        ref.evidence_text.toLowerCase().includes(query) ||
        ref.explanation.toLowerCase().includes(query)
      ) || [];

      const hasScriptureMatch = scriptureMatches.length > 0;

      if (searchOnlyScriptures) {
        if (hasScriptureMatch) {
          results.push({
            topic: video.title,
            start_time: 0,
            end_time: 0,
            summary: video.executive_summary,
            video_title: video.title,
            youtube_id: video.youtube_id,
            video_url: video.url,
            scripture_references: scriptureMatches,
            speaker_name: video.speaker_name,
            channel_name: video.channel_name
          });
        }
      } else if (
        video.title.toLowerCase().includes(query) ||
        video.executive_summary.toLowerCase().includes(query) ||
        video.themes_and_topics.overarching_message.toLowerCase().includes(query) ||
        video.themes_and_topics.categories.some(t => t.toLowerCase().includes(query)) ||
        video.keywords.some(k => k.toLowerCase().includes(query)) ||
        hasScriptureMatch
      ) {
        // Add as a "virtual" segment if no specific segments match
        results.push({
          topic: video.title,
          start_time: 0,
          end_time: 0,
          summary: video.executive_summary,
          video_title: video.title,
          youtube_id: video.youtube_id,
          video_url: video.url,
          scripture_references: video.all_scripture_references || [],
          speaker_name: video.speaker_name,
          channel_name: video.channel_name
        });
      }
    });

    setSearchResults(results);
    setSelectedVideo(null);
  };

  const processSingleVideo = async (videoUrl: string, videoTitle?: string, videoMeta?: any, batchProgress?: number) => {
    if (!user) {
      setError('Please sign in to index videos.');
      return;
    }
    if (stopRequested) throw new Error('StoppedByUser');
    
    setStatus(`Processing ${videoTitle || videoUrl}...`);
    if (!batchProgress) setProgress(5);

    try {
      const youtubeId = extractYoutubeId(videoUrl);
      if (forceIndex) {
        const q = query(collection(db, 'videos'), where('userId', '==', user.uid), where('youtube_id', '==', youtubeId));
        const snapshot = await getDocs(q);
        for (const doc of snapshot.docs) {
          const segmentsSnapshot = await getDocs(collection(db, `videos/${doc.id}/segments`));
          for (const segmentDoc of segmentsSnapshot.docs) {
            await deleteDoc(segmentDoc.ref);
          }
          await deleteDoc(doc.ref);
        }
      }
      
      if (stopRequested) throw new Error('StoppedByUser');
      if (!batchProgress) setProgress(15);

      const transcriptRes = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: videoUrl }),
      });
      
      if (!transcriptRes.ok) {
        const errorData = await transcriptRes.json();
        throw new Error(errorData.error || 'Failed to fetch transcript');
      }
      const { transcript, title, fallback } = await transcriptRes.json();
      
      if (stopRequested) throw new Error('StoppedByUser');
      if (!batchProgress) setProgress(30);

      let analysis: VideoAnalysis;
      let fullTranscriptText = '';
      if (fallback) {
        setStatus(`Generating AI alternative for ${title}...`);
        analysis = await generateAltTranscript(videoUrl, title);
        fullTranscriptText = analysis.transcription || analysis.executive_summary;
      } else {
        setStatus(`Analyzing ${title} with AI...`);
        const rawTranscriptText = transcript.map((t: any) => `[${t.offset}s] ${t.text}`).join(' ');
        analysis = await analyzeTranscript(rawTranscriptText, videoUrl, title);
        fullTranscriptText = analysis.transcription || rawTranscriptText;
      }

      if (stopRequested) throw new Error('StoppedByUser');
      if (!batchProgress) setProgress(70);

      setStatus(`Saving ${title} to database...`);
      
      const videoData = {
        youtube_id: youtubeId,
        title: `${title || videoTitle || `Video ${youtubeId}`} (${new Date().toLocaleString()})`,
        url: videoUrl,
        executive_summary: analysis.executive_summary,
        linkable_timestamps: analysis.linkable_timestamps,
        themes_and_topics: analysis.themes_and_topics,
        key_points: analysis.key_points,
        keywords: analysis.keywords,
        speaker_name: analysis.speaker_name || videoMeta?.author?.name || 'Unknown',
        channel_name: analysis.channel_name || videoMeta?.author?.name || 'Unknown',
        video_timestamp: videoMeta?.duration || 'Unknown',
        token_count: estimateTokens(videoUrl),
        userId: user.uid,
        createdAt: serverTimestamp(),
        transcript: fullTranscriptText,
        channel_url: videoMeta?.author?.url || '',
        minute_by_minute: analysis.minute_by_minute || [],
        theological_topics: analysis.theological_topics || [],
        scripture_references: analysis.scripture_references || [],
        entities: analysis.entities || [],
        arguments: analysis.arguments || [],
        debate_claims: analysis.debate_claims || [],
        all_scripture_references: analysis.all_scripture_references || []
      };

      if (stopRequested) throw new Error('StoppedByUser');
      if (!batchProgress) setProgress(85);

      try {
        const videoRef = await addDoc(collection(db, 'videos'), videoData);
        
        // Save linkable timestamps as segments for search compatibility
        const segmentsBatch = analysis.linkable_timestamps.map(ts => {
          const parts = ts.time.split(':');
          let seconds = 0;
          if (parts.length === 2) seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
          else if (parts.length === 3) seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);

          return addDoc(collection(db, `videos/${videoRef.id}/segments`), {
            topic: ts.description,
            start_time: seconds,
            end_time: seconds + 60, // Rough estimate
            summary: ts.description,
            videoId: videoRef.id,
            scripture_references: ts.scripture_references || []
          });
        });
        await Promise.all(segmentsBatch);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'videos');
      }

      if (!batchProgress) setProgress(100);
      return true;
    } catch (err: any) {
      if (err.message === 'StoppedByUser') throw err;
      console.error(err);
      throw err;
    }
  };

  const estimateTokens = (url: string) => {
    // Very rough estimate: 1 minute of video ~ 150 tokens
    // This is a placeholder.
    return 1500; 
  };

  const handleProcessVideo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;

    const youtubeId = extractYoutubeId(url);
    console.log('Extracted youtubeId:', youtubeId);
    if (!forceIndex && await checkVideoProcessed(youtubeId)) {
      setError('Video already processed.');
      return;
    }

    setIsProcessing(true);
    setProgress(0);
    setStopRequested(false);
    setIsStopping(false);
    setError(null);
    setStatus('Fetching video metadata...');
    try {
      const metaRes = await fetch(`/api/video-metadata?url=${encodeURIComponent(url)}`);
      let videoMeta = null;
      if (metaRes.ok) {
        videoMeta = await metaRes.json();
      }

      await processSingleVideo(url, undefined, videoMeta);
      setStatus('Done!');
      setUrl('');
      setForceIndex(false);
    } catch (err: any) {
      if (err.message === 'StoppedByUser') {
        setStatus('Stopped by user');
      } else {
        setError(err.message || 'An unexpected error occurred');
      }
    } finally {
      setIsProcessing(false);
      setIsStopping(false);
      setTimeout(() => setStatus(''), 3000);
    }
  };

  const fetchChannelVideos = async (e: React.FormEvent | null, page = 1) => {
    if (e) e.preventDefault();
    if (!channelUrl.trim()) return;

    setIsFetchingChannel(true);
    setError(null);
    try {
      const res = await fetch(`/api/channel-videos?channelUrl=${encodeURIComponent(channelUrl)}&page=${page}`);
      if (!res.ok) throw new Error('Failed to fetch channel videos');
      const data = await res.json();
      setChannelVideos(page === 1 ? data : [...channelVideos, ...data]);
      setChannelPage(page);
    } catch (err: any) {
      setError(err.message || 'Failed to fetch channel');
    } finally {
      setIsFetchingChannel(false);
    }
  };

  const processBatch = async () => {
    if (selectedChannelVideos.length === 0) return;

    setIsProcessing(true);
    setProgress(0);
    setStopRequested(false);
    setIsStopping(false);
    setError(null);
    let successCount = 0;
    let failCount = 0;

    try {
      const total = selectedChannelVideos.length;
      for (let i = 0; i < total; i++) {
        if (stopRequested) throw new Error('StoppedByUser');
        
        const videoUrl = selectedChannelVideos[i];
        const video = channelVideos.find(v => v.url === videoUrl);
        const youtubeId = extractYoutubeId(videoUrl);
        
        setProgress((i / total) * 100);
        
        if (await checkVideoProcessed(youtubeId)) {
          console.log(`Skipping ${videoUrl}, already processed.`);
          successCount++;
          continue;
        }
        try {
          await processSingleVideo(videoUrl, video?.title, video, (i / total) * 100);
          successCount++;
        } catch (err: any) {
          if (err.message === 'StoppedByUser') throw err;
          console.error(`Failed to process ${videoUrl}`, err);
          failCount++;
        }
      }
      setProgress(100);
      setStatus(`Batch complete: ${successCount} succeeded, ${failCount} failed.`);
      setChannelVideos([]);
      setSelectedChannelVideos([]);
    } catch (err: any) {
      if (err.message === 'StoppedByUser') {
        setStatus('Batch stopped by user');
      } else {
        setError(err.message || 'Batch processing error');
      }
    } finally {
      setIsProcessing(false);
      setIsStopping(false);
      setTimeout(() => setStatus(''), 5000);
    }
  };

  const toggleVideoSelection = (videoUrl: string) => {
    setSelectedChannelVideos(prev => 
      prev.includes(videoUrl) 
        ? prev.filter(url => url !== videoUrl) 
        : [...prev, videoUrl]
    );
  };

  const toggleHistorySelection = (videoId: string) => {
    setSelectedHistoryVideos(prev => 
      prev.includes(videoId) 
        ? prev.filter(id => id !== videoId) 
        : [...prev, videoId]
    );
  };

  const viewVideoSegments = async (video: IndexedVideo) => {
    setSelectedVideo(video);
    setSearchResults([]);
    try {
      const q = query(collection(db, `videos/${video.id}/segments`), orderBy('start_time', 'asc'));
      const snapshot = await getDocs(q);
      const segments = snapshot.docs.map(doc => doc.data()) as Segment[];
      setVideoSegments(segments);
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `videos/${video.id}/segments`);
    }
  };

  const handleViewDetails = (videoUrl: string) => {
    const video = videos.find(v => v.url === videoUrl);
    if (video) {
      viewVideoSegments(video);
    }
  };

  const handleTranslate = async () => {
    if (!selectedVideo) return;
    setIsTranslating(true);
    try {
      const targetLang = language === 'en' ? 'Arabic' : 'English';
      const translated = await translateVideoAnalysis(selectedVideo as any, targetLang);
      setSelectedVideo(translated as any);
    } catch (err) {
      console.error("Translation failed", err);
    } finally {
      setIsTranslating(false);
    }
  };

  const deleteVideo = async (id: string) => {
    if (!confirm('Are you sure you want to delete this video?')) return;
    try {
      await deleteDoc(doc(db, 'videos', id));
      if (selectedVideo?.id === id) {
        setSelectedVideo(null);
        setVideoSegments([]);
      }
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `videos/${id}`);
    }
  };

  const checkVideoProcessed = async (youtubeId: string) => {
    if (!user) return false;
    console.log('Checking if video processed:', youtubeId, 'for user:', user.uid);
    try {
      const q = query(
        collection(db, 'videos'), 
        where('userId', '==', user.uid), 
        where('youtube_id', '==', youtubeId)
      );
      const snapshot = await getDocs(q);
      console.log('Snapshot empty:', snapshot.empty);
      return !snapshot.empty;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, 'videos');
      return false;
    }
  };

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return [h, m, s]
      .map(v => v < 10 ? "0" + v : v)
      .filter((v, i) => v !== "00" || i > 0)
      .join(":");
  };

  const parseJson = (val: any) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
      return JSON.parse(val);
    } catch (e) {
      return [];
    }
  };

  const exportData = async (format: 'json' | 'txt' | 'csv', video: IndexedVideo | IndexedVideo[]) => {
    const data = Array.isArray(video) ? video : [video];
    
    // Fetch segments for all videos
    const dataWithSegments = await Promise.all(data.map(async (v) => {
      const q = query(collection(db, `videos/${v.id}/segments`), orderBy('start_time', 'asc'));
      const snapshot = await getDocs(q);
      const segments = snapshot.docs.map(doc => doc.data()) as Segment[];
      return { ...v, segments };
    }));

    let content = '';
    let mimeType = 'text/plain';
    let fileName = 'videos_export';

    if (format === 'json') {
      content = JSON.stringify(dataWithSegments, null, 2);
      mimeType = 'application/json';
      fileName += '.json';
    } else if (format === 'txt') {
      content = dataWithSegments.map(v => `Title: ${v.title}\nURL: ${v.url}\nSpeaker: ${v.speaker_name || 'N/A'}\nChannel: ${v.channel_name || 'N/A'}\nTimestamp: ${v.video_timestamp || 'N/A'}\n\nExecutive Summary\n${v.executive_summary}\n\nLinkable Timestamps\n${v.linkable_timestamps.map((ts: any) => `[${ts.time}] ${ts.description}`).join('\n')}\n\nThemes & Topics\nOverarching Message: ${v.themes_and_topics.overarching_message}\nCategories: ${v.themes_and_topics.categories.join(', ')}\n\nKey Points\n${v.key_points.join('\n')}\n\nKeywords\n${v.keywords.join(', ')}\n\nFull Transcript\n${v.transcript || 'N/A'}\n---\n`).join('\n');
      fileName += '.txt';
    } else if (format === 'csv') {
      const headers = ['Title', 'URL', 'Speaker', 'Channel', 'Timestamp', 'Executive Summary', 'Timestamps', 'Overarching Message', 'Categories', 'Key Points', 'Keywords', 'Transcript'];
      const rows = dataWithSegments.map(v => [
        v.title, 
        v.url, 
        v.speaker_name || 'N/A', 
        v.channel_name || 'N/A', 
        v.video_timestamp || 'N/A', 
        v.executive_summary, 
        v.linkable_timestamps.map((ts: any) => `[${ts.time}] ${ts.description}`).join('; '),
        v.themes_and_topics.overarching_message, 
        v.themes_and_topics.categories.join('; '), 
        v.key_points.join('; '),
        v.keywords.join('; '),
        v.transcript || 'N/A'
      ].map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','));
      content = [headers.join(','), ...rows].join('\n');
      mimeType = 'text/csv';
      fileName += '.csv';
    }

    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    setShowExportModal(false);
  };

  const downloadTranscript = (video: IndexedVideo) => {
    if (!video.transcript) {
      setError('No transcript available for this video.');
      return;
    }
    const blob = new Blob([video.transcript], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${video.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_subtitles.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans" dir={language === 'ar' ? 'rtl' : 'ltr'}>
      
      {/* Progress Overlay */}
      <AnimatePresence>
        {isProcessing && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="fixed bottom-8 right-8 z-50 w-80 bg-white rounded-2xl shadow-2xl p-6 border border-[#141414]/10"
          >
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3 overflow-hidden">
                <div className="w-8 h-8 rounded-full bg-[#141414] flex items-center justify-center shrink-0">
                  <Loader2 className="w-4 h-4 text-white animate-spin" />
                </div>
                <div className="overflow-hidden">
                  <h4 className="text-sm font-bold text-[#141414]">{t.processing}</h4>
                  <p className="text-[10px] text-[#141414]/60 truncate">{status}</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setStopRequested(true);
                  setIsStopping(true);
                }}
                disabled={isStopping}
                className="p-2 hover:bg-red-50 text-red-500 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                title="Stop Processing"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-2">
              <div className="flex justify-between text-[10px] font-medium">
                <span className="text-[#141414]/60">{isStopping ? 'Stopping...' : 'Progress'}</span>
                <span className="text-[#141414]">{Math.round(progress)}%</span>
              </div>
              <div className="h-1.5 w-full bg-[#141414]/5 rounded-full overflow-hidden">
                <motion.div 
                  className="h-full bg-[#141414]"
                  initial={{ width: 0 }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="border-b border-[#141414]/10 bg-white/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
            <div className="bg-[#141414] p-2 rounded-lg">
              <Database className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-serif italic tracking-tight">{t.title}</h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setLanguage(language === 'en' ? 'ar' : 'en')}
                className="px-3 py-1.5 bg-[#141414]/5 text-[#141414] rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-[#141414]/10 transition-all"
              >
                {t.switchLang}
              </button>
              <button 
                onClick={() => setCurrentPage(currentPage === 'main' ? 'history' : 'main')}
                className="text-sm font-medium text-[#141414]/60 hover:text-[#141414]"
              >
                {currentPage === 'main' ? t.history : t.title}
              </button>
              <div className="flex items-center gap-2">
                <form onSubmit={handleSearch} className="relative">
                  <Search className={`absolute ${language === 'ar' ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/40`} />
                  <input
                    type="text"
                    placeholder={t.searchPlaceholder}
                    className={`${language === 'ar' ? 'pr-10 pl-4' : 'pl-10 pr-4'} py-2 bg-white border border-[#141414]/10 rounded-full text-sm w-48 focus:outline-none focus:ring-2 focus:ring-[#141414]/5 transition-all`}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </form>
                <button
                  onClick={() => {
                    setSearchOnlyScriptures(!searchOnlyScriptures);
                    if (searchQuery) handleSearch({ preventDefault: () => {} } as any);
                  }}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all border ${
                    searchOnlyScriptures 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200' 
                      : 'bg-white text-[#141414]/40 border-[#141414]/10 hover:border-[#141414]/20'
                  }`}
                >
                  <BookOpen className="w-3 h-3" />
                  {t.allReferences}
                </button>
              </div>
            </div>

            <div className="h-6 w-px bg-[#141414]/10 hidden sm:block"></div>

            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold text-[#141414]">{user.displayName}</p>
                  <p className="text-[10px] text-[#141414]/40">{user.email}</p>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt={user.displayName || ''} className="w-8 h-8 rounded-full border border-[#141414]/10" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-[#141414]/5 flex items-center justify-center border border-[#141414]/10">
                    <User className="w-4 h-4 text-[#141414]/40" />
                  </div>
                )}
                <button 
                  onClick={logout}
                  className="p-1.5 hover:bg-red-50 rounded-lg transition-colors group"
                  title={t.logout}
                >
                  <LogOut className="w-4 h-4 text-[#141414]/40 group-hover:text-red-500" />
                </button>
              </div>
            ) : (
              <button 
                onClick={signIn}
                className="flex items-center gap-2 px-3 py-1.5 bg-[#141414] text-white rounded-lg text-sm font-medium hover:bg-[#141414]/90 transition-all"
              >
                <LogIn className="w-3.5 h-3.5" />
                {t.login}
              </button>
            )}
          </div>
        </div>
      </header>

      <main className={`max-w-6xl mx-auto px-6 py-12 ${!selectedVideo && user ? 'grid grid-cols-1 lg:grid-cols-12 gap-12' : 'block'}`}>
        {!user ? (
          <div className="lg:col-span-12 flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-[#141414]/5 p-6 rounded-3xl mb-6">
              <LogIn className="w-12 h-12 text-[#141414]/20" />
            </div>
            <h2 className="text-3xl font-serif italic text-[#141414] mb-3">{t.title}</h2>
            <p className="text-[#141414]/60 max-w-md mb-8">
              {t.subtitle}
            </p>
            <button 
              onClick={signIn}
              className="flex items-center gap-3 px-8 py-4 bg-[#141414] text-white rounded-2xl font-bold hover:bg-[#141414]/90 transition-all shadow-lg shadow-[#141414]/10"
            >
              <LogIn className="w-5 h-5" />
              {t.login}
            </button>
          </div>
        ) : selectedVideo ? (
          <div className="w-full">
            <AnimatePresence mode="wait">
              <motion.div
                key="video-detail"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <button 
                  onClick={() => setSelectedVideo(null)}
                  className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-[#141414]/40 hover:text-[#141414] transition-colors mb-8 group"
                >
                  <ArrowLeft className={`w-4 h-4 group-hover:${language === 'ar' ? 'translate-x-1' : '-translate-x-1'} transition-transform ${language === 'ar' ? 'rotate-180' : ''}`} />
                  {t.backToLibrary}
                </button>

                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-4xl font-serif italic mb-4 leading-tight">{selectedVideo.title}</h2>
                    <div className="flex flex-wrap gap-6 mb-6 text-[10px] font-bold uppercase tracking-widest text-[#141414]/40">
                      {selectedVideo.speaker_name && (
                        <div className="flex items-center gap-1.5">
                          <User className="w-3 h-3" />
                          <span>{t.speaker}:</span> <span className="text-[#141414]">{selectedVideo.speaker_name}</span>
                        </div>
                      )}
                      {selectedVideo.channel_name && (
                        <div className="flex items-center gap-1.5">
                          <Database className="w-3 h-3" />
                          <span>{t.channel}:</span> <span className="text-[#141414]">{selectedVideo.channel_name}</span>
                        </div>
                      )}
                    </div>

                    {selectedVideo.themes_and_topics?.overarching_message && (
                      <div className="bg-[#141414] text-white p-4 rounded-lg mb-8 text-xs font-bold uppercase tracking-widest leading-relaxed shadow-lg shadow-[#141414]/10">
                        {t.overarchingMessage}: {selectedVideo.themes_and_topics.overarching_message}
                      </div>
                    )}

                    <div className="flex flex-wrap gap-2 mb-4">
                      {selectedVideo.themes_and_topics?.categories.map((topic: string, i: number) => (
                        <button 
                          key={i} 
                          onClick={() => {
                            setSearchQuery(topic);
                            handleSearch({ preventDefault: () => {} } as any);
                            setSelectedVideo(null);
                          }}
                          className="text-[10px] uppercase tracking-wider font-bold bg-[#141414]/5 text-[#141414]/60 px-3 py-1.5 rounded-full border border-[#141414]/10 hover:bg-[#141414]/10 hover:text-[#141414] transition-all"
                        >
                          {topic}
                        </button>
                      ))}
                    </div>

                    <div className="flex flex-wrap gap-2 mb-8">
                      {selectedVideo.theological_topics?.map((topic, i) => (
                        <TheologicalTopicBadge 
                          key={i} 
                          topic={topic} 
                          onClick={() => {
                            setSearchQuery(topic);
                            handleSearch({ preventDefault: () => {} } as any);
                            setSelectedVideo(null);
                          }}
                        />
                      ))}
                    </div>

                    <div className="flex items-center gap-4">
                      <button
                        onClick={handleTranslate}
                        disabled={isTranslating}
                        className="flex items-center gap-2 px-6 py-3 bg-[#141414] text-white rounded-xl text-sm font-bold hover:bg-[#141414]/90 transition-all shadow-lg shadow-[#141414]/10 disabled:opacity-50"
                      >
                        {isTranslating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        {t.translate}
                      </button>
                      <a 
                        href={selectedVideo.url} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 hover:text-[#141414] flex items-center gap-1.5 transition-colors"
                      >
                        <span>{t.viewOnYoutube}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                      {selectedVideo.transcript && (
                        <button 
                          onClick={() => downloadTranscript(selectedVideo)}
                          className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 hover:text-[#141414] flex items-center gap-1.5 transition-colors"
                        >
                          <Download className="w-3 h-3" />
                          <span>{t.transcript}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {selectedVideo.executive_summary && (
                  <div className="bg-white p-8 rounded-3xl border border-[#141414]/5 shadow-sm">
                    <h3 className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-6 pb-2 border-b border-[#141414]/5">{t.executiveSummary}</h3>
                    <p className="text-sm leading-relaxed text-[#141414]/80 font-medium">{selectedVideo.executive_summary}</p>
                  </div>
                )}

                {selectedVideo.all_scripture_references && selectedVideo.all_scripture_references.length > 0 && (
                  <div className="bg-white p-6 rounded-2xl border border-[#141414]/5 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">{t.allReferences}</h3>
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full">
                        {selectedVideo.all_scripture_references.length} {t.searchResults}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedVideo.all_scripture_references.map((ref, i) => (
                        <ScriptureBadge key={i} reference={ref} />
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {selectedVideo.key_points && (
                    <DetailSection title={t.keyPoints}>
                      <ul className="space-y-2">
                        {selectedVideo.key_points.map((point: string, i: number) => (
                          <li key={i} className="text-sm text-[#141414]/70 flex gap-2">
                            <span className="text-[#141414]/30">•</span>
                            {point}
                          </li>
                        ))}
                      </ul>
                    </DetailSection>
                  )}
                  {selectedVideo.keywords && (
                    <DetailSection title={t.keywords}>
                      <div className="flex flex-wrap gap-2">
                        {selectedVideo.keywords.map((keyword: string, i: number) => (
                          <button 
                            key={i} 
                            onClick={() => { 
                              setSearchQuery(keyword); 
                              handleSearch({preventDefault: () => {}} as any); 
                              setSelectedVideo(null);
                            }}
                            className="text-xs bg-[#141414]/5 text-[#141414]/60 px-2 py-1 rounded-md hover:bg-[#141414]/10 hover:text-[#141414] transition-colors"
                          >
                            #{keyword}
                          </button>
                        ))}
                      </div>
                    </DetailSection>
                  )}
                </div>

                {selectedVideo.entities && selectedVideo.entities.length > 0 && (
                  <DetailSection title={t.entities}>
                    <div className="flex flex-wrap gap-2">
                      {selectedVideo.entities.map((entity, i) => (
                        <span key={i} className="text-xs bg-[#141414]/5 text-[#141414]/60 px-2 py-1 rounded-md">
                          {entity}
                        </span>
                      ))}
                    </div>
                  </DetailSection>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {selectedVideo.arguments && selectedVideo.arguments.length > 0 && (
                    <DetailSection title={t.logicalArguments}>
                      <div className="space-y-4">
                        {selectedVideo.arguments.map((arg, i) => (
                          <div key={i} className="border-l-2 border-blue-200 pl-4 py-1">
                            <p className="text-sm font-medium text-[#141414] mb-1">{arg.claim}</p>
                            <div className="flex items-center gap-2 text-[10px] text-[#141414]/40 uppercase tracking-widest">
                              <span className="font-bold">{arg.speaker}</span>
                              <span>•</span>
                              <span>{arg.timestamp}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </DetailSection>
                  )}

                  {selectedVideo.debate_claims && selectedVideo.debate_claims.length > 0 && (
                    <DetailSection title={t.debateClaims}>
                      <div className="space-y-4">
                        {selectedVideo.debate_claims.map((claim, i) => (
                          <div key={i} className="border-l-2 border-red-200 pl-4 py-1">
                            <p className="text-sm font-medium text-[#141414] mb-1">{claim.claim}</p>
                            <div className="flex items-center gap-2 text-[10px] text-[#141414]/40 uppercase tracking-widest">
                              <span className="font-bold">{claim.speaker}</span>
                              <span>•</span>
                              <span>{claim.timestamp}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </DetailSection>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">{t.linkableTimestamps}</h3>
                  <div className="grid gap-4">
                    {selectedVideo.linkable_timestamps?.map((ts, idx) => {
                      const parts = ts.time.split(':');
                      let seconds = 0;
                      if (parts.length === 2) seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                      else if (parts.length === 3) seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);

                      return (
                        <div key={idx} className="bg-white p-4 rounded-xl border border-[#141414]/5 shadow-sm hover:border-[#141414]/10 transition-all">
                          <div className="flex items-start gap-4">
                            <a 
                              href={`${getCleanYoutubeUrl(selectedVideo.url)}&t=${seconds}s`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors shrink-0"
                            >
                              [{ts.time}]
                            </a>
                            <div className="flex-1 space-y-3">
                              <p className="text-sm text-[#141414]/80 font-medium">{ts.description}</p>
                              {ts.scripture_references && ts.scripture_references.length > 0 && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {ts.scripture_references.map((ref: any, i: number) => (
                                    <ScriptureBadge key={i} reference={ref} />
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>
        ) : (
          <>
            {/* Left Column: Input & List */}
            <div className="lg:col-span-4 space-y-12">
              <section className="bg-white p-6 rounded-3xl border border-[#141414]/5 shadow-sm">
                <div className="flex gap-6 mb-6 border-b border-[#141414]/5">
                  <button 
                    onClick={() => setActiveTab('single')}
                    className={`text-[10px] font-bold uppercase tracking-widest pb-3 border-b-2 transition-all ${activeTab === 'single' ? 'border-[#141414] text-[#141414]' : 'border-transparent text-[#141414]/40'}`}
                  >
                    {t.single}
                  </button>
                  <button 
                    onClick={() => setActiveTab('channel')}
                    className={`text-[10px] font-bold uppercase tracking-widest pb-3 border-b-2 transition-all ${activeTab === 'channel' ? 'border-[#141414] text-[#141414]' : 'border-transparent text-[#141414]/40'}`}
                  >
                    {t.batch}
                  </button>
                  <button 
                    onClick={() => setActiveTab('history')}
                    className={`text-[10px] font-bold uppercase tracking-widest pb-3 border-b-2 transition-all ${activeTab === 'history' ? 'border-[#141414] text-[#141414]' : 'border-transparent text-[#141414]/40'}`}
                  >
                    {t.history}
                  </button>
                </div>

                {activeTab === 'single' ? (
                  <form onSubmit={handleProcessVideo} className="space-y-3">
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="YouTube URL..."
                        className={`w-full px-4 py-3 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#141414]/5 ${
                          error ? 'border-red-500' : 'border-[#141414]/10'
                        }`}
                        value={url}
                        onChange={(e) => {
                          setUrl(e.target.value);
                          setTokenCount(estimateTokens(e.target.value));
                        }}
                        disabled={isProcessing}
                      />
                      {tokenCount > 0 && (
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#141414]/40">
                          ~{tokenCount} tokens
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="forceIndex"
                        checked={forceIndex}
                        onChange={(e) => setForceIndex(e.target.checked)}
                        disabled={isProcessing}
                      />
                      <label htmlFor="forceIndex" className="text-xs text-[#141414]/60">Force re-index</label>
                    </div>
                    {error && (
                      <motion.div 
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        className="bg-red-50 border border-red-100 p-3 rounded-xl"
                      >
                        <p className="text-xs text-red-600 leading-relaxed">
                          {error}
                        </p>
                      </motion.div>
                    )}
                    <button
                      type="submit"
                      disabled={isProcessing}
                      className="w-full bg-[#141414] text-white py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#141414]/90 transition-all disabled:opacity-50"
                    >
                      {isProcessing ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span className="truncate">{status || 'Processing...'}</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4" />
                          <span>Index Video</span>
                        </>
                      )}
                    </button>
                  </form>
                ) : activeTab === 'channel' ? (
                  <div className="space-y-4">
                    <form onSubmit={fetchChannelVideos} className="space-y-3">
                      <div className="relative">
                        <input
                          type="text"
                          placeholder="Channel URL (e.g. @Veritasium)..."
                          className={`w-full px-4 py-3 bg-white border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#141414]/5 ${
                            error ? 'border-red-500' : 'border-[#141414]/10'
                          }`}
                          value={channelUrl}
                          onChange={(e) => setChannelUrl(e.target.value)}
                          disabled={isFetchingChannel || isProcessing}
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isFetchingChannel || isProcessing}
                        className="w-full bg-[#141414] text-white py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#141414]/90 transition-all disabled:opacity-50"
                      >
                        {isFetchingChannel ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Fetching Channel...</span>
                          </>
                        ) : (
                          <>
                            <Search className="w-4 h-4" />
                            <span>Find Videos</span>
                          </>
                        )}
                      </button>
                    </form>

                    {channelVideos.length > 0 && (
                      <div className="space-y-4 pt-4 border-t border-[#141414]/5">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer group">
                            <input 
                              type="checkbox" 
                              checked={selectedChannelVideos.length === channelVideos.length}
                              onChange={() => {
                                if (selectedChannelVideos.length === channelVideos.length) {
                                  setSelectedChannelVideos([]);
                                } else {
                                  setSelectedChannelVideos(channelVideos.map((v: any) => v.url));
                                }
                              }}
                              className="w-4 h-4 rounded border-[#141414]/20 text-[#141414] focus:ring-[#141414]"
                            />
                            <span className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 group-hover:text-[#141414] transition-colors">Select All</span>
                          </label>
                          <span className="text-[10px] font-mono text-[#141414]/40">{selectedChannelVideos.length} / {channelVideos.length}</span>
                        </div>
                        
                        <div className="max-h-64 overflow-y-auto border border-[#141414]/10 rounded-xl bg-[#141414]/[0.02] p-2 space-y-1 custom-scrollbar">
                          {channelVideos.map((video) => (
                            <label key={video.url} className="flex items-center gap-3 p-2.5 hover:bg-white hover:shadow-sm rounded-lg cursor-pointer transition-all border border-transparent hover:border-[#141414]/5 group">
                              <input 
                                type="checkbox" 
                                checked={selectedChannelVideos.includes(video.url)}
                                onChange={() => toggleVideoSelection(video.url)}
                                className="w-4 h-4 rounded border-[#141414]/20 text-[#141414] focus:ring-[#141414]"
                              />
                              <span className="text-xs truncate flex-1 text-[#141414]/70 group-hover:text-[#141414]">{video.title}</span>
                            </label>
                          ))}
                        </div>

                        <div className="flex flex-col gap-2">
                          <button
                            onClick={() => fetchChannelVideos(null, channelPage + 1)}
                            disabled={isFetchingChannel}
                            className="text-[10px] font-bold uppercase tracking-widest py-2 text-[#141414]/40 hover:text-[#141414] disabled:opacity-50 transition-colors"
                          >
                            {isFetchingChannel ? 'Loading...' : 'Load More Videos'}
                          </button>
                          <button
                            onClick={processBatch}
                            disabled={isProcessing || selectedChannelVideos.length === 0}
                            className="w-full bg-[#141414] text-white py-4 rounded-xl text-sm font-bold flex items-center justify-center gap-2 hover:bg-[#141414]/90 transition-all disabled:opacity-50 shadow-lg shadow-[#141414]/10"
                          >
                            {isProcessing ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span className="truncate">{status || 'Processing Batch...'}</span>
                              </>
                            ) : (
                              <>
                                <Database className="w-4 h-4" />
                                <span>Index {selectedChannelVideos.length} Videos</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <HistoryPage 
                    videos={videos} 
                    selectedHistoryVideos={selectedHistoryVideos} 
                    toggleHistorySelection={toggleHistorySelection} 
                    deleteVideo={deleteVideo} 
                    setExportTarget={setExportTarget} 
                    setShowExportModal={setShowExportModal}
                    t={t}
                  />
                )}
              </section>

              {activeTab !== 'history' && (
                <section>
                  <h2 className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-6 flex items-center gap-2">
                    <Database className="w-3 h-3" />
                    {t.library}
                  </h2>
                  <div className="space-y-3">
                    {videos.length === 0 ? (
                      <p className="text-sm text-[#141414]/40 italic">{t.noVideos}</p>
                    ) : (
                      videos.map((video) => (
                        <div key={video.id} className="group relative">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => viewVideoSegments(video)}
                              className={`flex-1 text-left p-4 rounded-2xl border transition-all flex items-center gap-4 ${
                                selectedVideo?.id === video.id 
                                  ? 'bg-white border-[#141414] shadow-md ring-1 ring-[#141414]/5' 
                                  : 'bg-white/50 border-transparent hover:border-[#141414]/10 hover:bg-white hover:shadow-sm'
                              }`}
                            >
                              <div className={`p-2 rounded-xl transition-colors ${selectedVideo?.id === video.id ? 'bg-[#141414] text-white' : 'bg-[#141414]/5 text-[#141414]/40'}`}>
                                <Video className="w-4 h-4" />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-serif italic truncate leading-tight mb-1">{video.title}</p>
                                <div className="flex items-center gap-3">
                                  <p className="text-[10px] font-bold uppercase tracking-tighter text-[#141414]/40">{video.speaker_name || 'Unknown'}</p>
                                  <span className="text-[10px] font-mono text-[#141414]/20">{video.token_count || 0} tokens</span>
                                </div>
                              </div>
                              <ChevronRight className={`w-4 h-4 text-[#141414]/20 transition-transform ${selectedVideo?.id === video.id ? 'rotate-90 text-[#141414]' : ''}`} />
                            </button>
                            <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button 
                                onClick={() => exportData('json', video)}
                                className="p-2 rounded-lg bg-white border border-[#141414]/5 hover:bg-[#141414] hover:text-white transition-all shadow-sm"
                                title="Download JSON"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button 
                                onClick={() => deleteVideo(video.id)}
                                className="p-2 rounded-lg bg-white border border-[#141414]/5 hover:bg-red-500 hover:text-white transition-all shadow-sm"
                                title="Delete"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </section>
              )}
            </div>

            {/* Right Column: Results */}
            <div className="lg:col-span-8">
              <AnimatePresence mode="wait">
                {searchResults.length > 0 ? (
                  <motion.div
                    key="search-results"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-6"
                  >
                    <div className="flex items-center justify-between">
                      <h2 className="text-2xl font-serif italic">{t.searchResults} "{searchQuery}"</h2>
                      <span className="text-xs font-medium bg-[#141414]/5 px-3 py-1 rounded-full">
                        {searchResults.length} {t.searchResults}
                      </span>
                    </div>
                    <div className="grid gap-4">
                      {searchResults.map((result, idx) => (
                        <SearchResultCard 
                          key={idx} 
                          result={result} 
                          formatTime={formatTime} 
                          onViewDetails={handleViewDetails}
                        />
                      ))}
                    </div>
                  </motion.div>
                ) : (
                  <motion.div
                    key="empty-state"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="h-[60vh] flex flex-col items-center justify-center text-center space-y-4"
                  >
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-[#141414]/5">
                      <Video className="w-12 h-12 mx-auto mb-4 text-[#141414]/10" />
                      <h2 className="text-xl font-medium mb-2">{t.readyToIndex}</h2>
                      <p className="text-sm text-[#141414]/40 max-w-xs">
                        {t.pasteUrlInstruction}
                      </p>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </>
        )}
      </main>

      {/* Export Modal */}
      {showExportModal && exportTarget && (
        <div className="fixed inset-0 bg-[#141414]/40 backdrop-blur-sm flex items-center justify-center z-50 p-6">
          <motion.div 
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="bg-white p-8 rounded-[2rem] w-full max-w-sm space-y-8 shadow-2xl border border-[#141414]/5"
          >
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-serif italic text-[#141414]">{t.exportData}</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mt-1">{t.selectFormat}</p>
              </div>
              <button 
                onClick={() => setShowExportModal(false)}
                className="p-2 hover:bg-[#141414]/5 rounded-full transition-colors"
              >
                <X className="w-5 h-5 text-[#141414]/40" />
              </button>
            </div>
            
            <div className="grid grid-cols-1 gap-3">
              {(['json', 'txt', 'csv'] as const).map(format => (
                <button 
                  key={format}
                  onClick={() => exportData(format, exportTarget)}
                  className="group flex items-center justify-between px-6 py-4 bg-[#141414]/[0.02] hover:bg-[#141414] rounded-2xl transition-all border border-[#141414]/5"
                >
                  <span className="text-sm font-bold uppercase tracking-widest text-[#141414]/60 group-hover:text-white transition-colors">{format}</span>
                  <Download className="w-4 h-4 text-[#141414]/20 group-hover:text-white transition-colors" />
                </button>
              ))}
            </div>
            
            <p className="text-[10px] text-center text-[#141414]/30 font-mono">
              {t.exportDescription}
            </p>
          </motion.div>
        </div>
      )}
      </div>
    </ErrorBoundary>
  );
}

function TheologicalTopicBadge({ topic, onClick }: { topic: string, onClick?: () => void }) {
  return (
    <button 
      onClick={onClick}
      className="text-[10px] uppercase tracking-wider font-bold bg-purple-50 text-purple-600 px-2 py-1 rounded border border-purple-100 hover:bg-purple-100 transition-colors"
    >
      {topic}
    </button>
  );
}

function DetailSection({ title, children, className = "" }: { title: string, children: React.ReactNode, className?: string }) {
  return (
    <div className={`bg-white p-6 rounded-2xl border border-[#141414]/5 shadow-sm ${className}`}>
      <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-3">{title}</h3>
      {children}
    </div>
  );
}

function ScriptureBadge({ reference }: { reference: any }) {
  const refType = reference.reference_type?.toLowerCase() || '';
  const isQuran = refType === 'quran';
  const isBible = refType === 'bible';
  
  const badgeColor = isQuran 
    ? 'bg-emerald-50 text-emerald-700 border-emerald-100' 
    : isBible 
      ? 'bg-amber-50 text-amber-700 border-amber-100'
      : 'bg-gray-50 text-gray-700 border-gray-100';
  
  return (
    <div className={`inline-flex flex-col p-2 rounded-lg border ${badgeColor} text-xs space-y-1 w-full`}>
      <div className="flex items-center gap-1.5 font-bold">
        <BookOpen className="w-3 h-3" />
        <span>{reference.reference}</span>
        {reference.match_type && (
          <span className="text-[10px] opacity-60 uppercase tracking-tighter">({reference.match_type.replace('_', ' ')})</span>
        )}
      </div>
      {reference.evidence_text && (
        <p className="italic opacity-80 line-clamp-2">"{reference.evidence_text}"</p>
      )}
      {reference.explanation && (
        <p className="text-[10px] opacity-60 leading-tight">{reference.explanation}</p>
      )}
    </div>
  );
}

function SearchResultCard({ result, formatTime, onViewDetails }: { result: SearchResult, formatTime: (s: number) => string, onViewDetails: (videoUrl: string) => void }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-[#141414]/5 shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium group-hover:text-[#141414] transition-colors">{result.topic}</h3>
          <p className="text-xs text-[#141414]/40 flex items-center gap-1 mt-1">
            <Video className="w-3 h-3" />
            <span>{result.video_title}</span>
            {result.speaker_name && (
              <>
                <span className="mx-1">•</span>
                <User className="w-3 h-3" />
                <span>{result.speaker_name}</span>
              </>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => onViewDetails(result.video_url)}
            className="p-2 rounded-full bg-[#141414]/5 text-[#141414]/40 hover:bg-[#141414] hover:text-white transition-all"
            title="View Full Analysis"
          >
            <FileText className="w-4 h-4" />
          </button>
          <a
            href={`${getCleanYoutubeUrl(result.video_url)}&t=${Math.floor(result.start_time)}s`}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#141414]/5 p-2 rounded-full hover:bg-[#141414] hover:text-white transition-all"
            title="Watch on YouTube"
          >
            <Play className="w-4 h-4 fill-current" />
          </a>
        </div>
      </div>
      <p className="text-sm text-[#141414]/70 mb-4 leading-relaxed">
        {result.summary}
      </p>
      <div className="flex items-center gap-4 text-xs font-mono text-[#141414]/40">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{formatTime(result.start_time)} - {formatTime(result.end_time)}</span>
        </div>
      </div>
      {result.scripture_references && result.scripture_references.length > 0 && (
        <div className="space-y-2 mt-4 pt-4 border-t border-[#141414]/5">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/30">Scripture References</p>
          <div className="grid grid-cols-1 gap-2">
            {result.scripture_references.map((ref, i) => (
              <ScriptureBadge key={i} reference={ref} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SegmentCard({ segment, formatTime, youtubeId }: { segment: Segment, formatTime: (s: number) => string, youtubeId: string }) {
  const videoUrl = `https://youtube.com/watch?v=${youtubeId}`;
  const cleanUrl = getCleanYoutubeUrl(videoUrl);
  
  return (
    <div className="bg-white p-6 rounded-2xl border border-[#141414]/5 shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-start justify-between mb-4">
        <a
          href={`${cleanUrl}&t=${Math.floor(segment.start_time)}s`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-lg font-serif italic hover:text-[#141414]/60 transition-colors"
        >
          {segment.topic}
        </a>
        <a
          href={`${cleanUrl}&t=${Math.floor(segment.start_time)}s`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[#141414]/5 p-2 rounded-full hover:bg-[#141414] hover:text-white transition-all"
        >
          <Play className="w-4 h-4 fill-current" />
        </a>
      </div>
      <p className="text-sm text-[#141414]/70 mb-4 leading-relaxed">
        {segment.summary}
      </p>
      <div className="flex items-center gap-4 text-xs font-mono text-[#141414]/40">
        <div className="flex items-center gap-1">
          <Clock className="w-3 h-3" />
          <span>{formatTime(segment.start_time)} - {formatTime(segment.end_time)}</span>
        </div>
      </div>
      {segment.scripture_references && segment.scripture_references.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-[#141414]/5">
          {segment.scripture_references.map((ref, i) => (
            <ScriptureBadge key={i} reference={ref} />
          ))}
        </div>
      )}
    </div>
  );
}
