import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

export interface Hadith {
  id?: string;
  source_collection: string;
  source_short: string;
  book_name_en: string;
  chapter_name_en: string;
  hadith_number: string;
  text_ar: string;
  text_en: string;
  grade: 'Sahih' | 'Hasan' | 'Daif' | 'Other';
  topics: string[];
  narrator: string;
  review_status: 'draft' | 'reviewed' | 'approved';
  generated_by_ai: boolean;
}

export interface HadithUsage {
  id?: string;
  video_id: string;
  timestamp: number;
  hadith_id: string;
  detected_text: string;
  match_type: 'exact' | 'approximate' | 'topic_level';
  confidence_score: number;
}

export const addHadithUsage = async (usage: HadithUsage) => {
  const usageRef = collection(db, 'hadith_usage');
  await addDoc(usageRef, { ...usage, createdAt: serverTimestamp() });
};

export const getHadithById = async (hadithId: string) => {
  // Implementation to fetch Hadith by ID
};
