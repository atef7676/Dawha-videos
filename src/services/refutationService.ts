import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  serverTimestamp
} from 'firebase/firestore';
import { db } from '../firebase';

export interface RefutationEntry {
  id?: string;
  claim: string;
  claim_type: 'misconception' | 'polemical' | 'comparative' | 'doctrinal';
  response_summary: string;
  detailed_response: string;
  topics: string[];
  related_quran: string[];
  related_hadith: string[];
  related_bible: string[];
  review_status: 'draft' | 'reviewed' | 'approved';
}

export const addRefutationEntry = async (entry: RefutationEntry) => {
  const refRef = collection(db, 'refutation_entries');
  await addDoc(refRef, { ...entry, createdAt: serverTimestamp() });
};

export const getRefutationEntries = async () => {
  const refRef = collection(db, 'refutation_entries');
  const snapshot = await getDocs(refRef);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as RefutationEntry));
};
