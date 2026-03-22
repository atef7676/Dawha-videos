import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp,
  doc,
  updateDoc
} from 'firebase/firestore';
import { db } from '../firebase';

export interface ReviewQueueEntry {
  id?: string;
  content_type: 'quran_link' | 'hadith_link' | 'knowledge_entry' | 'refutation' | 'scripture_usage' | 'topic_page';
  content_id: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  reason: 'new_ai_generated' | 'low_confidence' | 'doctrinal_sensitive' | 'flagged_by_user' | 'needs_update';
  status: 'pending' | 'in_review' | 'approved' | 'rejected' | 'needs_revision';
  assigned_to?: string;
  created_at: Date;
  updated_at?: Date;
}

export interface ReviewLogEntry {
  id?: string;
  content_id: string;
  reviewer_name: string;
  review_action: 'approved' | 'rejected' | 'edited' | 'commented';
  notes?: string;
  timestamp: Date;
}

export const addToReviewQueue = async (entry: Omit<ReviewQueueEntry, 'id' | 'created_at'>) => {
  const queueRef = collection(db, 'review_queue');
  await addDoc(queueRef, { ...entry, created_at: serverTimestamp() });
};

export const addReviewLog = async (log: Omit<ReviewLogEntry, 'id' | 'timestamp'>) => {
  const logRef = collection(db, 'review_log');
  await addDoc(logRef, { ...log, timestamp: serverTimestamp() });
};

export const updateReviewStatus = async (reviewId: string, status: ReviewQueueEntry['status']) => {
  const reviewRef = doc(db, 'review_queue', reviewId);
  await updateDoc(reviewRef, { status, updated_at: serverTimestamp() });
};
