/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, Plus, Video, Clock, ChevronRight, Loader2, Play, ExternalLink, Database, Download, X, Trash2, LogIn, LogOut, User } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import HistoryPage from './HistoryPage';
import { analyzeTranscript, generateAltTranscript, Segment, VideoAnalysis } from './services/geminiService';
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
  linkable_timestamps: { time: string; description: string }[];
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
}

interface SearchResult extends Segment {
  video_title: string;
  youtube_id: string;
  video_url: string;
}

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
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [url, setUrl] = useState('');
  const [forceIndex, setForceIndex] = useState(false);
  const [channelUrl, setChannelUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isFetchingChannel, setIsFetchingChannel] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [videos, setVideos] = useState<IndexedVideo[]>([]);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
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
    // Note: This only searches videos already in the 'videos' state
    videos.forEach(video => {
      if (
        video.title.toLowerCase().includes(query) ||
        video.executive_summary.toLowerCase().includes(query) ||
        video.themes_and_topics.overarching_message.toLowerCase().includes(query) ||
        video.themes_and_topics.categories.some(t => t.toLowerCase().includes(query)) ||
        video.keywords.some(k => k.toLowerCase().includes(query))
      ) {
        // Add as a "virtual" segment if no specific segments match
        results.push({
          topic: video.title,
          start_time: 0,
          end_time: 0,
          summary: video.executive_summary,
          video_title: video.title,
          youtube_id: video.youtube_id,
          video_url: video.url
        });
      }
    });

    setSearchResults(results);
    setSelectedVideo(null);
  };

  const processSingleVideo = async (videoUrl: string, videoTitle?: string, videoMeta?: any) => {
    if (!user) {
      setError('Please sign in to index videos.');
      return;
    }
    setStatus(`Processing ${videoTitle || videoUrl}...`);
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
        speaker_name: videoMeta?.author?.name || 'Unknown',
        channel_name: videoMeta?.author?.name || 'Unknown',
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
        debate_claims: analysis.debate_claims || []
      };

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
            videoId: videoRef.id
          });
        });
        await Promise.all(segmentsBatch);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'videos');
      }

      return true;
    } catch (err: any) {
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
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setIsProcessing(false);
      setStatus('');
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
    setError(null);
    let successCount = 0;
    let failCount = 0;

    try {
      for (const videoUrl of selectedChannelVideos) {
        const video = channelVideos.find(v => v.url === videoUrl);
        const youtubeId = extractYoutubeId(videoUrl);
        if (await checkVideoProcessed(youtubeId)) {
          console.log(`Skipping ${videoUrl}, already processed.`);
          continue;
        }
        try {
          await processSingleVideo(videoUrl, video?.title, video);
          successCount++;
        } catch (err) {
          console.error(`Failed to process ${videoUrl}`, err);
          failCount++;
        }
      }
      setStatus(`Batch complete: ${successCount} succeeded, ${failCount} failed.`);
      setChannelVideos([]);
      setSelectedChannelVideos([]);
    } catch (err: any) {
      setError(err.message || 'Batch processing error');
    } finally {
      setIsProcessing(false);
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

  const extractYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : url;
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
      <div className="min-h-screen bg-[#F5F5F0] text-[#141414] font-sans">
      {/* Header */}
      <header className="border-b border-[#141414]/10 bg-white/50 backdrop-blur-md sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-[#141414] p-2 rounded-lg">
              <Database className="text-white w-5 h-5" />
            </div>
            <h1 className="text-xl font-semibold tracking-tight">VideoMind</h1>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setCurrentPage(currentPage === 'main' ? 'history' : 'main')}
                className="text-sm font-medium text-[#141414]/60 hover:text-[#141414]"
              >
                {currentPage === 'main' ? 'View History' : 'Back to Indexer'}
              </button>
              <form onSubmit={handleSearch} className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#141414]/40" />
                <input
                  type="text"
                  placeholder="Search topics..."
                  className="pl-10 pr-4 py-2 bg-white border border-[#141414]/10 rounded-full text-sm w-48 focus:outline-none focus:ring-2 focus:ring-[#141414]/5 transition-all"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </form>
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
                  title="Sign Out"
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
                Sign In
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
        {!user ? (
          <div className="lg:col-span-12 flex flex-col items-center justify-center py-20 text-center">
            <div className="bg-[#141414]/5 p-6 rounded-3xl mb-6">
              <LogIn className="w-12 h-12 text-[#141414]/20" />
            </div>
            <h2 className="text-2xl font-bold text-[#141414] mb-2">Welcome to VideoMind</h2>
            <p className="text-[#141414]/60 max-w-md mb-8">
              Sign in with your Google account to start indexing videos and save your analysis history permanently.
            </p>
            <button 
              onClick={signIn}
              className="flex items-center gap-3 px-8 py-4 bg-[#141414] text-white rounded-2xl font-bold hover:bg-[#141414]/90 transition-all shadow-lg shadow-[#141414]/10"
            >
              <LogIn className="w-5 h-5" />
              Sign In with Google
            </button>
          </div>
        ) : (
          <>
            {/* Left Column: Input & List */}
        <div className="lg:col-span-4 space-y-8">
          <section>
            <div className="flex gap-4 mb-4">
              <button 
                onClick={() => setActiveTab('single')}
                className={`text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'single' ? 'border-[#141414] text-[#141414]' : 'border-transparent text-[#141414]/40'}`}
              >
                Single
              </button>
              <button 
                onClick={() => setActiveTab('channel')}
                className={`text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'channel' ? 'border-[#141414] text-[#141414]' : 'border-transparent text-[#141414]/40'}`}
              >
                Batch
              </button>
              <button 
                onClick={() => setActiveTab('history')}
                className={`text-xs font-bold uppercase tracking-widest pb-1 border-b-2 transition-all ${activeTab === 'history' ? 'border-[#141414] text-[#141414]' : 'border-transparent text-[#141414]/40'}`}
              >
                History
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
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 mb-2">
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
                        className="w-4 h-4 accent-[#141414]"
                      />
                      <span className="text-xs font-bold uppercase tracking-widest text-[#141414]/60">Select All</span>
                    </div>
                    <div className="max-h-64 overflow-y-auto border border-[#141414]/10 rounded-xl bg-white p-2 space-y-1">
                      {channelVideos.map((video) => (
                        <label key={video.url} className="flex items-center gap-3 p-2 hover:bg-[#141414]/5 rounded-lg cursor-pointer transition-colors">
                          <input 
                            type="checkbox" 
                            checked={selectedChannelVideos.includes(video.url)}
                            onChange={() => toggleVideoSelection(video.url)}
                            className="w-4 h-4 accent-[#141414]"
                          />
                          <span className="text-xs truncate flex-1">{video.title}</span>
                        </label>
                      ))}
                    </div>
                    <button
                      onClick={() => fetchChannelVideos(null, channelPage + 1)}
                      disabled={isFetchingChannel}
                      className="w-full text-xs text-center py-2 text-[#141414]/60 hover:text-[#141414] disabled:opacity-50"
                    >
                      {isFetchingChannel ? 'Loading...' : 'Load More'}
                    </button>
                    <button
                      onClick={processBatch}
                      disabled={isProcessing || selectedChannelVideos.length === 0}
                      className="w-full bg-[#141414] text-white py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 hover:bg-[#141414]/90 transition-all disabled:opacity-50"
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
              />
            )}
          </section>

          {activeTab !== 'history' && (
            <section>
              <h2 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-4">Indexed Library</h2>
              <div className="space-y-2">
                {videos.length === 0 ? (
                  <p className="text-sm text-[#141414]/40 italic">No videos indexed yet.</p>
                ) : (
                  videos.map((video) => (
                    <div key={video.id} className="w-full">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => viewVideoSegments(video)}
                          className={`flex-1 text-left p-4 rounded-xl border transition-all flex items-center gap-4 group ${
                            selectedVideo?.id === video.id 
                              ? 'bg-white border-[#141414] shadow-sm' 
                              : 'bg-white/50 border-transparent hover:border-[#141414]/10 hover:bg-white'
                          }`}
                        >
                          <div className="bg-[#141414]/5 p-2 rounded-lg group-hover:bg-[#141414]/10 transition-colors">
                            <Video className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{video.title}</p>
                            <div className="flex items-center gap-2">
                              <p className="text-xs text-[#141414]/40">{video.channel_name || video.youtube_id}</p>
                              <span className="text-[10px] bg-[#141414]/5 text-[#141414]/40 px-1.5 py-0.5 rounded">{video.token_count} tokens</span>
                            </div>
                          </div>
                          <ChevronRight className={`w-4 h-4 transition-transform ${selectedVideo?.id === video.id ? 'rotate-90' : ''}`} />
                        </button>
                        <button 
                          onClick={() => exportData('json', video)}
                          className="p-3 rounded-xl bg-white/50 border border-transparent hover:border-[#141414]/10 hover:bg-white transition-all"
                          title="Download JSON"
                        >
                          <Download className="w-4 h-4" />
                        </button>
                      </div>
                      {selectedVideo?.id === video.id && (
                        <div className="p-6 mt-4 bg-white rounded-2xl border border-[#141414]/5 shadow-sm space-y-6">
                          <div className="flex justify-between items-start gap-4">
                            <h3 className="text-xl font-bold text-[#141414] leading-tight">{video.title}</h3>
                            <div className="flex items-center gap-3 shrink-0">
                              <button 
                                onClick={() => downloadTranscript(video)}
                                className="flex items-center gap-1.5 text-xs font-bold text-[#141414]/60 hover:text-[#141414] transition-colors"
                                title="Download Subtitles"
                              >
                                <Download className="w-3.5 h-3.5" />
                                Subtitles
                              </button>
                              <a href={video.url} target="_blank" rel="noopener noreferrer" className="text-sm text-blue-600 hover:underline font-medium">View on YouTube</a>
                            </div>
                          </div>

                          <section className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 bg-[#141414]/5 rounded-xl border border-[#141414]/5">
                            <div>
                              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-1">Channel</h4>
                              {video.channel_url ? (
                                <a 
                                  href={video.channel_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer" 
                                  className="text-sm font-medium text-[#141414] hover:text-blue-600 flex items-center gap-1"
                                >
                                  {video.channel_name}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              ) : (
                                <p className="text-sm font-medium text-[#141414]">{video.channel_name || 'N/A'}</p>
                              )}
                            </div>
                            <div>
                              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-1">Speaker</h4>
                              <p className="text-sm font-medium text-[#141414]">{video.speaker_name || 'N/A'}</p>
                            </div>
                            <div>
                              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-1">Duration</h4>
                              <p className="text-sm font-medium text-[#141414]">{video.video_timestamp || 'N/A'}</p>
                            </div>
                            <div>
                              <h4 className="text-[10px] font-bold uppercase tracking-widest text-[#141414]/40 mb-1">Tokens</h4>
                              <p className="text-sm font-medium text-[#141414]">{video.token_count || 'N/A'}</p>
                            </div>
                          </section>
                          
                          <section>
                            <h4 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2">Executive Summary</h4>
                            <p className="text-sm text-[#141414]/80 leading-relaxed">{video.executive_summary}</p>
                          </section>

                          {video.linkable_timestamps && video.linkable_timestamps.length > 0 && (
                            <section>
                              <h4 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-3">Linkable Timestamps</h4>
                              <div className="space-y-2">
                                {video.linkable_timestamps.map((ts: any, i: number) => {
                                  const parts = ts.time.split(':');
                                  let seconds = 0;
                                  if (parts.length === 2) seconds = parseInt(parts[0]) * 60 + parseInt(parts[1]);
                                  else if (parts.length === 3) seconds = parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2]);
                                  
                                  return (
                                    <div key={i} className="flex gap-3 text-sm">
                                      <a 
                                        href={`${video.url}&t=${seconds}s`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="font-mono text-blue-600 hover:underline shrink-0"
                                      >
                                        [{ts.time}]
                                      </a>
                                      <p className="text-[#141414]/80">{ts.description}</p>
                                    </div>
                                  );
                                })}
                              </div>
                            </section>
                          )}

                          {video.themes_and_topics && (
                            <section>
                              <h4 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2">Themes & Topics</h4>
                              <div className="space-y-3">
                                <div>
                                  <p className="text-xs font-bold text-[#141414]/60 mb-1">Overarching Message</p>
                                  <p className="text-sm text-[#141414]/80 italic">"{video.themes_and_topics.overarching_message}"</p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {video.themes_and_topics.categories.map((cat: string, i: number) => (
                                    <span key={i} className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-600 px-2 py-1 rounded border border-blue-100">
                                      {cat}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            </section>
                          )}

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {video.key_points && (
                              <section>
                                <h4 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2">Key Points</h4>
                                <ul className="list-disc list-inside text-sm text-[#141414]/80 space-y-1">
                                  {video.key_points.map((point: string, i: number) => <li key={i}>{point}</li>)}
                                </ul>
                              </section>
                            )}
                            
                            {video.keywords && (
                              <section>
                                <h4 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2">Keywords</h4>
                                <div className="flex flex-wrap gap-2">
                                  {video.keywords.map((keyword: string, i: number) => (
                                    <span key={i} className="text-xs bg-[#141414]/5 text-[#141414]/60 px-2 py-1 rounded-md">#{keyword}</span>
                                  ))}
                                </div>
                              </section>
                            )}
                          </div>

                           {video.minute_by_minute && video.minute_by_minute.length > 0 && (
                            <section className="border-t border-[#141414]/5 pt-6">
                              <h4 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-3">Minute-by-Minute Breakdown</h4>
                              <div className="space-y-2">
                                {video.minute_by_minute.map((item, i) => (
                                  <div key={i} className="flex gap-4 text-sm border-b border-[#141414]/5 pb-2 last:border-0">
                                    <span className="font-mono text-[#141414]/40 shrink-0">[{item.timestamp}]</span>
                                    <p className="text-[#141414]/80">{item.content}</p>
                                  </div>
                                ))}
                              </div>
                            </section>
                          )}

                          {video.transcript && (
                            <section className="border-t border-[#141414]/5 pt-6">
                              <button 
                                onClick={() => setShowTranscript(!showTranscript)}
                                className="flex items-center justify-between w-full text-left group"
                              >
                                <h4 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">Full Transcription</h4>
                                <span className="text-[10px] font-bold text-blue-600 uppercase tracking-widest group-hover:underline">
                                  {showTranscript ? 'Hide' : 'Show'}
                                </span>
                              </button>
                              
                              <AnimatePresence>
                                {showTranscript && (
                                  <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                  >
                                    <div className="mt-4 p-4 bg-[#141414]/5 rounded-xl max-h-[400px] overflow-y-auto custom-scrollbar">
                                      <pre className="text-xs text-[#141414]/70 whitespace-pre-wrap font-sans leading-relaxed">
                                        {video.transcript}
                                      </pre>
                                    </div>
                                  </motion.div>
                                )}
                              </AnimatePresence>
                            </section>
                          )}
                        </div>
                      )}
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
                  <h2 className="text-2xl font-serif italic">Search results for "{searchQuery}"</h2>
                  <span className="text-xs font-medium bg-[#141414]/5 px-3 py-1 rounded-full">
                    {searchResults.length} segments found
                  </span>
                </div>
                <div className="grid gap-4">
                  {searchResults.map((result, idx) => (
                    <SearchResultCard key={idx} result={result} formatTime={formatTime} />
                  ))}
                </div>
              </motion.div>
            ) : selectedVideo ? (
              <motion.div
                key="video-detail"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-8"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <h2 className="text-3xl font-serif italic mb-2">{selectedVideo.title}</h2>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {selectedVideo.themes_and_topics?.overarching_message && (
                        <span className="text-[10px] uppercase tracking-wider font-bold bg-[#141414] text-white px-2 py-1 rounded">
                          Message: {selectedVideo.themes_and_topics.overarching_message}
                        </span>
                      )}
                      {selectedVideo.themes_and_topics?.categories.map((topic: string, i: number) => (
                        <span key={i} className="text-[10px] uppercase tracking-wider font-bold bg-[#141414]/5 text-[#141414]/60 px-2 py-1 rounded">
                          {topic}
                        </span>
                      ))}
                    </div>
                    <a 
                      href={selectedVideo.url} 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="text-sm text-[#141414]/40 hover:text-[#141414] flex items-center gap-1 transition-colors"
                    >
                      <span>View on YouTube</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>

                {selectedVideo.executive_summary && (
                  <div className="bg-white p-6 rounded-2xl border border-[#141414]/5 shadow-sm">
                    <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-3">Executive Summary</h3>
                    <p className="text-sm leading-relaxed text-[#141414]/80">{selectedVideo.executive_summary}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {selectedVideo.key_points && (
                    <div className="bg-white p-6 rounded-2xl border border-[#141414]/5 shadow-sm">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-3">Key Points</h3>
                      <ul className="space-y-2">
                        {selectedVideo.key_points.map((point: string, i: number) => (
                          <li key={i} className="text-sm text-[#141414]/70 flex gap-2">
                            <span className="text-[#141414]/30">•</span>
                            {point}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedVideo.keywords && (
                    <div className="bg-white p-6 rounded-2xl border border-[#141414]/5 shadow-sm">
                      <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-3">Keywords</h3>
                      <div className="flex flex-wrap gap-2">
                        {selectedVideo.keywords.map((keyword: string, i: number) => (
                          <button 
                            key={i} 
                            onClick={() => { 
                              setSearchQuery(keyword); 
                              handleSearch({preventDefault: () => {}} as any); 
                            }}
                            className="text-xs bg-[#141414]/5 text-[#141414]/60 px-2 py-1 rounded-md hover:bg-[#141414]/10 hover:text-[#141414] transition-colors"
                          >
                            #{keyword}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold uppercase tracking-widest text-[#141414]/40">Linkable Timestamps</h3>
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
                              href={`${selectedVideo.url}&t=${seconds}s`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs font-mono font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded hover:bg-blue-100 transition-colors shrink-0"
                            >
                              [{ts.time}]
                            </a>
                            <p className="text-sm text-[#141414]/80">{ts.description}</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
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
                  <h2 className="text-xl font-medium mb-2">Ready to index?</h2>
                  <p className="text-sm text-[#141414]/40 max-w-xs">
                    Paste a YouTube URL to transcribe and identify topics, or search your library for specific discussions.
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
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl w-96 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Export Data</h3>
              <button onClick={() => setShowExportModal(false)}><X className="w-5 h-5" /></button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(['json', 'txt', 'csv'] as const).map(format => (
                <button 
                  key={format}
                  onClick={() => exportData(format, exportTarget)}
                  className="bg-[#141414]/5 hover:bg-[#141414]/10 py-2 rounded-lg text-sm font-medium uppercase"
                >
                  {format}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      </div>
    </ErrorBoundary>
  );
}

function SearchResultCard({ result, formatTime }: { result: SearchResult, formatTime: (s: number) => string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-[#141414]/5 shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-medium group-hover:text-[#141414] transition-colors">{result.topic}</h3>
          <p className="text-xs text-[#141414]/40 flex items-center gap-1 mt-1">
            <Video className="w-3 h-3" />
            <span>{result.video_title}</span>
          </p>
        </div>
        <a
          href={`${result.video_url}&t=${Math.floor(result.start_time)}s`}
          target="_blank"
          rel="noopener noreferrer"
          className="bg-[#141414]/5 p-2 rounded-full hover:bg-[#141414] hover:text-white transition-all"
        >
          <Play className="w-4 h-4 fill-current" />
        </a>
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
    </div>
  );
}

function SegmentCard({ segment, formatTime, youtubeId }: { segment: Segment, formatTime: (s: number) => string, youtubeId: string }) {
  return (
    <div className="bg-white p-6 rounded-2xl border border-[#141414]/5 shadow-sm hover:shadow-md transition-all group">
      <div className="flex items-start justify-between mb-4">
        <a
          href={`https://youtube.com/watch?v=${youtubeId}&t=${Math.floor(segment.start_time)}s`}
          target="_blank"
          rel="noopener noreferrer"
          className="text-lg font-medium hover:text-[#141414]/60 transition-colors"
        >
          {segment.topic}
        </a>
        <a
          href={`https://youtube.com/watch?v=${youtubeId}&t=${Math.floor(segment.start_time)}s`}
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
    </div>
  );
}
