import { 
  collection, 
  addDoc, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  doc, 
  serverTimestamp,
  getDoc,
  setDoc,
  Timestamp
} from "firebase/firestore";
import { db } from "../firebase";
import { VideoAnalysis, Argument } from "./geminiService";
import { GoogleGenAI } from "@google/genai";

export interface QuranVerse {
  id?: string;
  surah_number: number;
  surah_name_en: string;
  surah_name_ar: string;
  ayah_number: number;
  text_ar: string;
  text_en: string;
  normalized_text: string;
  topics: string[];
  keywords: string[];
  revelation_type: 'Meccan' | 'Medinan';
}

export interface BibleVerse {
  id?: string;
  book: string;
  chapter: number;
  verse: number;
  text_en: string;
  normalized_text: string;
  topics: string[];
  keywords: string[];
}

export interface ScriptureUsage {
  id?: string;
  video_id: string;
  timestamp: number;
  scripture_id: string;
  context: string;
  confidence_score: number;
}

export interface KnowledgeBaseEntry {
  id?: string;
  title: string;
  type: 'topic' | 'concept' | 'question';
  content: string;
  topics: string[];
  keywords: string[];
  related_quran: string[];
  related_bible: string[];
  related_videos: string[];
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface KnowledgeTopic {
  id?: string;
  title: string;
  description: string;
  categories: string[];
  related_scriptures: string[];
  cross_faith_comparisons?: string;
  embedding?: number[];
  userId: string;
  createdAt: any;
  updatedAt: any;
}

export interface KnowledgeEntry {
  id?: string;
  topicId: string;
  sourceType: "video" | "text" | "scripture";
  sourceId: string;
  content: string;
  speaker?: string;
  timestamp?: number;
  metadata?: any;
  embedding?: number[];
  userId: string;
  createdAt: any;
}

export async function syncVideoToKnowledgeBase(analysis: VideoAnalysis, videoId: string, userId: string) {
  console.log(`Syncing video ${videoId} to knowledge base...`);

  // 1. Process Theological Topics
  for (const topicTitle of analysis.theological_topics) {
    const topicId = await getOrCreateTopic(topicTitle, userId);
    
    // Create an entry for this topic from the video
    // Find segments or key points related to this topic? 
    // For now, let's use the executive summary or specific key points that mention the topic.
    const relevantContent = analysis.key_points
      .filter(kp => kp.toLowerCase().includes(topicTitle.toLowerCase()))
      .join("\n") || analysis.executive_summary;

    await addKnowledgeEntry({
      topicId,
      sourceType: "video",
      sourceId: videoId,
      content: relevantContent,
      speaker: analysis.speaker_name,
      metadata: {
        videoTitle: analysis.title,
        videoUrl: analysis.url
      },
      userId
    });

    await refreshTopicSummary(topicId, userId);
  }

  // 2. Process Arguments and Debate Claims
  const allArguments = [...analysis.arguments, ...analysis.debate_claims];
  for (const arg of allArguments) {
    // Try to find a relevant topic for this argument
    const topicTitle = await identifyTopicForArgument(arg.claim);
    const topicId = await getOrCreateTopic(topicTitle, userId);

    await addKnowledgeEntry({
      topicId,
      sourceType: "video",
      sourceId: videoId,
      content: arg.claim,
      speaker: arg.speaker,
      timestamp: parseTimestamp(arg.timestamp),
      metadata: {
        videoTitle: analysis.title,
        videoUrl: analysis.url,
        argumentType: arg.type
      },
      userId
    });

    await refreshTopicSummary(topicId, userId);
  }

  // 3. Process Scripture References
  for (const ref of analysis.all_scripture_references) {
    // Try to find a relevant topic for this scripture reference
    // We can use the topic_tags provided by Gemini or identify one
    const topicTitle = ref.topic_tags?.[0] || await identifyTopicForArgument(`Scripture reference: ${ref.reference} (${ref.explanation})`);
    const topicId = await getOrCreateTopic(topicTitle, userId);

    // Update topic's related_scriptures
    const topicDoc = await getDoc(doc(db, "knowledge_topics", topicId));
    if (topicDoc.exists()) {
      const currentRefs = topicDoc.data().related_scriptures || [];
      if (!currentRefs.includes(ref.reference_key)) {
        await updateDoc(doc(db, "knowledge_topics", topicId), {
          related_scriptures: [...currentRefs, ref.reference_key]
        });
      }
    }

    await addKnowledgeEntry({
      topicId,
      sourceType: "scripture",
      sourceId: videoId,
      content: `${ref.reference}: ${ref.explanation}\n\nEvidence: "${ref.evidence_text}"\nMatch Type: ${ref.match_type} (Confidence: ${ref.confidence_score})`,
      speaker: analysis.speaker_name,
      metadata: {
        videoTitle: analysis.title,
        videoUrl: analysis.url,
        referenceKey: ref.reference_key,
        referenceType: ref.reference_type,
        matchType: ref.match_type
      },
      userId
    });

    await refreshTopicSummary(topicId, userId);
  }
}

async function getOrCreateTopic(title: string, userId: string): Promise<string> {
  const q = query(
    collection(db, "knowledge_topics"), 
    where("userId", "==", userId), 
    where("title", "==", title)
  );
  const snapshot = await getDocs(q);

  if (!snapshot.empty) {
    return snapshot.docs[0].id;
  }

  // Generate embedding for the topic title
  let embedding: number[] = [];
  try {
    const result = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: [title]
    });
    embedding = result.embeddings[0].values;
  } catch (e) {
    console.error("Failed to generate topic embedding", e);
  }

  const docRef = await addDoc(collection(db, "knowledge_topics"), {
    title,
    description: "",
    categories: [],
    related_scriptures: [],
    embedding,
    userId,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });

  return docRef.id;
}

async function addKnowledgeEntry(entry: Omit<KnowledgeEntry, "createdAt">) {
  // Check if entry already exists (to avoid duplicates on re-sync)
  const q = query(
    collection(db, "knowledge_entries"),
    where("topicId", "==", entry.topicId),
    where("sourceId", "==", entry.sourceId),
    where("content", "==", entry.content)
  );
  const snapshot = await getDocs(q);
  if (!snapshot.empty) return;

  // Generate embedding for the content
  let embedding: number[] = [];
  try {
    const result = await ai.models.embedContent({
      model: "gemini-embedding-2-preview",
      contents: [entry.content]
    });
    embedding = result.embeddings[0].values;
  } catch (e) {
    console.error("Failed to generate entry embedding", e);
  }

  await addDoc(collection(db, "knowledge_entries"), {
    ...entry,
    embedding,
    createdAt: serverTimestamp()
  });
}

async function identifyTopicForArgument(claim: string): Promise<string> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Identify the single most relevant theological topic or category for the following claim. 
    Return ONLY the topic name (e.g., "Trinity", "Atonement", "Prophethood", "Justice").
    
    Claim: ${claim}`,
  });
  return response.text?.trim() || "General Theology";
}

export async function refreshTopicSummary(topicId: string, userId: string) {
  const topicDoc = await getDoc(doc(db, "knowledge_topics", topicId));
  if (!topicDoc.exists()) return;

  const entriesQ = query(collection(db, "knowledge_entries"), where("topicId", "==", topicId));
  const entriesSnapshot = await getDocs(entriesQ);
  const entries = entriesSnapshot.docs.map(d => d.data() as KnowledgeEntry);

  if (entries.length === 0) return;

  const combinedContent = entries.map(e => `[${e.sourceType}] ${e.speaker ? `${e.speaker}: ` : ""}${e.content}`).join("\n\n");

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are a theological researcher. Summarize the following insights into a cohesive, unified description for the topic: "${topicDoc.data().title}".
    
    Include:
    1. A unified summary of the topic.
    2. A section on "Cross-Faith Comparisons" if relevant.
    3. A list of key arguments found.
    
    Insights:
    ${combinedContent}
    `,
  });

  const summary = response.text || "";

  await updateDoc(doc(db, "knowledge_topics", topicId), {
    description: summary,
    updatedAt: serverTimestamp()
  });
}

export const addScriptureUsage = async (usage: ScriptureUsage) => {
  const usageRef = collection(db, 'scripture_usage');
  await addDoc(usageRef, { ...usage, createdAt: serverTimestamp() });
};

export const getKnowledgeBaseEntries = async () => {
  const kbRef = collection(db, 'knowledge_base');
  const snapshot = await getDocs(kbRef);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as KnowledgeBaseEntry));
};

export const addKnowledgeBaseEntry = async (entry: KnowledgeBaseEntry) => {
  const kbRef = collection(db, 'knowledge_base');
  await addDoc(kbRef, { ...entry, createdAt: serverTimestamp() });
};

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length !== vecB.length) return 0;
  const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
  const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
  const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));
  if (magnitudeA === 0 || magnitudeB === 0) return 0;
  return dotProduct / (magnitudeA * magnitudeB);
}

export async function askKnowledgeBase(queryText: string, userId: string): Promise<{
  answer: string;
  sources: { title: string; url?: string; type: string; content: string }[];
  followUpQuestions?: string[];
  debug?: {
    expandedQuery: string[];
    matchedTopics: string[];
    retrievedCount: number;
    confidence: string;
  };
}> {
  console.log(`Production Q&A Engine: "${queryText}"`);

  // 1. Query Expansion & Topic Mapping (Parallel)
  const expansionResponse = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `You are a semantic search optimizer. Expand the user's theological query into a list of related concepts, synonyms, and key terms to improve retrieval.
    
    User Query: "${queryText}"
    
    Return a JSON object with:
    - "expandedTerms": Array of 5-8 related keywords (e.g. "killing" -> ["war", "jihad", "violence", "self-defense"])
    - "potentialTopics": Array of 3-5 high-level theological topics this might relate to.`,
    config: { responseMimeType: "application/json" }
  });

  let expansion = { expandedTerms: [queryText], potentialTopics: [] };
  try {
    expansion = JSON.parse(expansionResponse.text || "{}");
  } catch (e) {
    console.error("Expansion failed", e);
  }

  const searchTerms = [queryText, ...expansion.expandedTerms];
  
  // 2. Generate Embeddings for Search Terms (Parallel)
  const embeddingResults = await Promise.all(
    searchTerms.slice(0, 3).map(term => 
      ai.models.embedContent({
        model: "gemini-embedding-2-preview",
        contents: [term]
      }).catch(() => null)
    )
  );

  const queryEmbeddings = embeddingResults
    .filter(r => r !== null)
    .map(r => r!.embeddings[0].values);

  // 3. Fetch All Topics & Filter (Topic Bridge)
  const topicsSnapshot = await getDocs(query(collection(db, "knowledge_topics"), where("userId", "==", userId)));
  const allTopics = topicsSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeTopic));

  // Match topics by embedding AND keyword
  const matchedTopics = allTopics.filter(topic => {
    // Semantic match
    const semanticMatch = queryEmbeddings.some(qEmb => 
      topic.embedding ? cosineSimilarity(qEmb, topic.embedding) > 0.4 : false
    );
    // Keyword match
    const keywordMatch = searchTerms.some(term => 
      topic.title.toLowerCase().includes(term.toLowerCase()) ||
      topic.categories?.some(c => c.toLowerCase().includes(term.toLowerCase()))
    );
    // AI suggested topic match
    const aiMatch = expansion.potentialTopics.some(pt => 
      topic.title.toLowerCase().includes(pt.toLowerCase())
    );

    return semanticMatch || keywordMatch || aiMatch;
  });

  // 4. Retrieve Entries (Multi-Field Search)
  // Search in matched topics + direct entry search + global search index
  let retrievedEntries: KnowledgeEntry[] = [];
  
  // A. From matched topics
  if (matchedTopics.length > 0) {
    const topicEntrySnapshots = await Promise.all(
      matchedTopics.map(t => getDocs(query(collection(db, "knowledge_entries"), where("topicId", "==", t.id))))
    );
    retrievedEntries.push(...topicEntrySnapshots.flatMap(s => s.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeEntry))));
  }

  // B. Search global_search_index
  const globalSearchSnapshot = await getDocs(query(collection(db, "global_search_index"), where("userId", "==", userId)));
  const globalEntries = globalSearchSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeEntry));
  retrievedEntries.push(...globalEntries.filter(entry => 
    searchTerms.some(term => entry.content.toLowerCase().includes(term.toLowerCase()))
  ));

  // C. Fallback: Direct keyword search on all entries if few results
  if (retrievedEntries.length < 5) {
    const allEntriesSnapshot = await getDocs(query(collection(db, "knowledge_entries"), where("userId", "==", userId)));
    const allEntries = allEntriesSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as KnowledgeEntry));
    
    const keywordMatches = allEntries.filter(entry => 
      searchTerms.some(term => entry.content.toLowerCase().includes(term.toLowerCase()))
    );
    retrievedEntries.push(...keywordMatches);
  }

  // 5. Rank and Deduplicate
  const uniqueEntries = Array.from(new Map(retrievedEntries.map(e => [e.id, e])).values());
  const rankedEntries = uniqueEntries
    .map(entry => {
      const similarity = queryEmbeddings.length > 0 && entry.embedding 
        ? Math.max(...queryEmbeddings.map(q => cosineSimilarity(q, entry.embedding!)))
        : 0;
      
      const keywordBoost = searchTerms.filter(t => entry.content.toLowerCase().includes(t.toLowerCase())).length * 0.1;
      
      return { entry, score: similarity + keywordBoost };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 15);

  if (rankedEntries.length === 0) {
    return {
      answer: "No exact match found. Showing closest related insights.",
      sources: [],
      debug: {
        expandedQuery: expansion.expandedTerms,
        matchedTopics: matchedTopics.map(t => t.title),
        retrievedCount: 0,
        confidence: "None"
      }
    };
  }

  // 6. Synthesis with Strict Grounding
  const context = rankedEntries.map(({ entry }) => {
    const sourceInfo = entry.metadata?.videoTitle ? `[Video: ${entry.metadata.videoTitle}]` : `[Source: ${entry.sourceType}]`;
    return `${sourceInfo} ${entry.speaker ? `${entry.speaker}: ` : ""}${entry.content}`;
  }).join("\n\n");

  const synthesisResponse = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `You are a theological research assistant. Answer the user's question based ONLY on the provided knowledge base context. 
    
    **STRICT RULES:**
    1. ONLY answer from indexed knowledge base. 
    2. NEVER use external knowledge or hallucinate.
    3. If the answer isn't in the context, say "No indexed evidence found".
    4. Cite every claim with its source (e.g. "[Video: Title]").
    5. Prioritize scripture references (Quran/Bible) if they exist in the context.
    6. If multiple viewpoints exist in the context (e.g. a debate), present them neutrally.
    
    Context:
    ${context}
    
    User Question: ${queryText}
    
    **OUTPUT FORMAT:**
    Return a JSON object:
    {
      "answer": "Clear explanation...",
      "evidence": ["Point 1 (Source)", "Point 2 (Source)"],
      "confidence": "High/Medium/Low",
      "followUpQuestions": ["Question 1", "Question 2"]
    }`,
    config: { responseMimeType: "application/json" }
  });

  let result = { answer: "No indexed evidence found", evidence: [], confidence: "Low", followUpQuestions: [] };
  try {
    result = JSON.parse(synthesisResponse.text || "{}");
  } catch (e) {
    console.error("Synthesis parse failed", e);
  }

  return {
    answer: result.answer,
    sources: rankedEntries.map(r => ({
      title: r.entry.metadata?.videoTitle || r.entry.sourceType,
      url: r.entry.metadata?.videoUrl,
      type: r.entry.sourceType,
      content: r.entry.content
    })),
    followUpQuestions: result.followUpQuestions,
    debug: {
      expandedQuery: expansion.expandedTerms,
      matchedTopics: matchedTopics.map(t => t.title),
      retrievedCount: rankedEntries.length,
      confidence: result.confidence
    }
  };
}

function parseTimestamp(ts: string): number {
  if (!ts) return 0;
  const parts = ts.split(":").map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}
