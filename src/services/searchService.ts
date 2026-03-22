import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  limit, 
  orderBy,
  serverTimestamp,
  deleteDoc,
  doc,
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export const generateEmbedding = async (text: string): Promise<number[]> => {
  const result = await ai.models.embedContent({
    model: "gemini-embedding-2-preview",
    contents: [text]
  });
  return result.embeddings[0].values;
};

export type SearchIndexType = 'video_segment' | 'argument' | 'summary' | 'scripture' | 'quran' | 'bible' | 'knowledge';

export interface SearchIndexEntry {
  id?: string;
  type: SearchIndexType;
  text: string;
  normalized_text: string;
  topics: string[];
  keywords: string[];
  video_id?: string;
  timestamp?: number;
  speaker?: string;
  confidence_score: number;
  video_title?: string;
  youtube_id?: string;
  createdAt?: any;
  embedding?: number[]; // Added this
  // Additional fields for Quran/Bible/Knowledge
  title?: string;
  book?: string;
  chapter?: number;
  verse?: number;
  surah_number?: number;
  ayah_number?: number;
}

export const cosineSimilarity = (vecA: number[], vecB: number[]): number => {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
};

export const normalizeText = (text: string): string => {
  if (!text) return '';
  
  // Basic normalization
  let normalized = text.toLowerCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, " ") // Replace punctuation with space
    .replace(/\s{2,}/g, " ") // Trim extra spaces
    .trim();

  // Arabic normalization
  normalized = normalized
    .replace(/[\u064B-\u0652]/g, "") // Remove harakat
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي");

  return normalized;
};

export const indexVideoData = async (video: any, videoId: string, userId: string) => {
  const batch = writeBatch(db);
  const indexRef = collection(db, 'global_search_index');

  try {
    // 1. Transcript chunks (20-40 words)
    if (video.transcript) {
      const words = video.transcript.split(/\s+/);
      const chunkSize = 30;
      for (let i = 0; i < words.length; i += chunkSize) {
        const chunk = words.slice(i, i + chunkSize).join(' ');
        const entry: SearchIndexEntry = {
          type: 'video_segment',
          text: chunk,
          normalized_text: normalizeText(chunk),
          topics: video.themes_and_topics?.categories || [],
          keywords: video.keywords || [],
          video_id: videoId,
          timestamp: i * 2, // Rough estimate if no timestamps in transcript
          speaker: video.speaker_name || 'Unknown',
          confidence_score: 1.0,
          video_title: video.title,
          youtube_id: video.youtube_id
        };
        const newDocRef = doc(indexRef);
        batch.set(newDocRef, { ...entry, userId, createdAt: serverTimestamp() });
      }
    }

    // 2. Summary
    if (video.executive_summary) {
      const entry: SearchIndexEntry = {
        type: 'summary',
        text: video.executive_summary,
        normalized_text: normalizeText(video.executive_summary),
        topics: video.themes_and_topics?.categories || [],
        keywords: video.keywords || [],
        video_id: videoId,
        timestamp: 0,
        speaker: video.speaker_name || 'Unknown',
        confidence_score: 1.0,
        video_title: video.title,
        youtube_id: video.youtube_id
      };
      const newDocRef = doc(indexRef);
      batch.set(newDocRef, { ...entry, userId, createdAt: serverTimestamp() });
    }

    // 3. Arguments
    if (video.arguments) {
      video.arguments.forEach((arg: any) => {
        const entry: SearchIndexEntry = {
          type: 'argument',
          text: `${arg.claim}: ${arg.evidence}`,
          normalized_text: normalizeText(`${arg.claim} ${arg.evidence}`),
          topics: video.themes_and_topics?.categories || [],
          keywords: video.keywords || [],
          video_id: videoId,
          timestamp: 0, // Could be improved if arguments had timestamps
          speaker: video.speaker_name || 'Unknown',
          confidence_score: arg.confidence_score || 0.8,
          video_title: video.title,
          youtube_id: video.youtube_id
        };
        const newDocRef = doc(indexRef);
        batch.set(newDocRef, { ...entry, userId, createdAt: serverTimestamp() });
      });
    }

    // 4. Scripture references
    if (video.all_scripture_references) {
      video.all_scripture_references.forEach((ref: any) => {
        const entry: SearchIndexEntry = {
          type: 'scripture',
          text: `${ref.reference}: ${ref.explanation}`,
          normalized_text: normalizeText(`${ref.reference} ${ref.explanation} ${ref.evidence_text}`),
          topics: ref.topic_tags || [],
          keywords: video.keywords || [],
          video_id: videoId,
          timestamp: 0,
          speaker: video.speaker_name || 'Unknown',
          confidence_score: ref.confidence_score || 0.9,
          video_title: video.title,
          youtube_id: video.youtube_id
        };
        const newDocRef = doc(indexRef);
        batch.set(newDocRef, { ...entry, userId, createdAt: serverTimestamp() });
      });
    }

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'global_search_index');
  }
};

export const searchUnifiedIndex = async (searchQuery: string, userId?: string) => {
  const normalizedQuery = normalizeText(searchQuery);
  const queryWords = normalizedQuery.split(/\s+/).filter(w => w.length > 2);
  
  if (queryWords.length === 0) return [];

  // 1. Semantic Search
  const queryEmbedding = await generateEmbedding(searchQuery);

  const collections = [
    { name: 'global_search_index', type: 'video' },
    { name: 'quran_collection', type: 'quran' },
    { name: 'bible_collection', type: 'bible' },
    { name: 'knowledge_base', type: 'knowledge' }
  ];

  const promises = collections.map(async (col) => {
    const colRef = collection(db, col.name);
    const q = query(
      colRef,
      where('normalized_text', '>=', normalizedQuery),
      where('normalized_text', '<=', normalizedQuery + '\uf8ff'),
      limit(20)
    );
    
    try {
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(), 
        type: col.type === 'video' ? doc.data().type : col.type 
      } as SearchIndexEntry));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, col.name);
      return [];
    }
  });

  const resultsArrays = await Promise.all(promises);
  let results = resultsArrays.flat();

  // 2. Ranking (Semantic + Keyword)
  results.sort((a, b) => {
    const aKeywordScore = countMatches(a.normalized_text, queryWords) * (a.confidence_score || 0.5);
    const bKeywordScore = countMatches(b.normalized_text, queryWords) * (b.confidence_score || 0.5);
    
    const aSemanticScore = a.embedding ? cosineSimilarity(queryEmbedding, a.embedding) : 0;
    const bSemanticScore = b.embedding ? cosineSimilarity(queryEmbedding, b.embedding) : 0;
    
    // Weighted score: 70% semantic, 30% keyword
    const aTotalScore = (aSemanticScore * 0.7) + (aKeywordScore * 0.3);
    const bTotalScore = (bSemanticScore * 0.7) + (bKeywordScore * 0.3);
    
    return bTotalScore - aTotalScore;
  });

  return results.slice(0, 20);
};

const countMatches = (text: string, words: string[]): number => {
  let count = 0;
  words.forEach(word => {
    if (text.includes(word)) count++;
  });
  return count;
};

export const getFallbackResults = async () => {
  const indexRef = collection(db, 'global_search_index');
  
  // Get some summaries and arguments as fallback
  const q = query(
    indexRef,
    where('type', 'in', ['summary', 'argument']),
    limit(10)
  );
  
  const snapshot = await getDocs(q);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as SearchIndexEntry));
};

export const getSearchSuggestions = async (searchQuery: string) => {
  const normalizedQuery = normalizeText(searchQuery);
  if (normalizedQuery.length < 3) return [];

  const indexRef = collection(db, 'global_search_index');
  const q = query(
    indexRef,
    where('normalized_text', '>=', normalizedQuery),
    where('normalized_text', '<=', normalizedQuery + '\uf8ff'),
    limit(5)
  );

  const snapshot = await getDocs(q);
  const results = snapshot.docs.map(doc => doc.data() as SearchIndexEntry);
  
  // Extract unique titles or topics as suggestions
  const suggestions = new Set<string>();
  results.forEach(r => {
    suggestions.add(r.video_title);
    r.topics.forEach(t => suggestions.add(t));
  });

  return Array.from(suggestions).slice(0, 5);
};
