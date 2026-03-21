import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Segment {
  topic: string;
  start_time: number;
  end_time: number;
  summary: string;
  scripture_references?: ScriptureReference[];
}

export interface MinuteEntry {
  timestamp: string;
  content: string;
}

export interface LinkableTimestamp {
  time: string;
  description: string;
  scripture_references?: ScriptureReference[];
}

export interface ThemesAndTopics {
  overarching_message: string;
  categories: string[];
}

export interface ScriptureReference {
  reference_type: "quran" | "hadith" | "bible";
  reference: string;
  reference_key: string; // Normalized key (e.g. Q_2_256, H_Bukhari_1, B_John_3_16)
  match_type: "exact_quote" | "explicit_reference" | "close_paraphrase" | "thematic_reference" | "uncertain";
  confidence_score: number;
  evidence_text: string;
  explanation: string;
  topic_tags: string[];
  start_time?: number;
  end_time?: number;
  verse_text?: string;
  surah?: number;
  ayah?: number;
  surah_name?: string;
  book?: string;
  chapter?: number;
  verse?: number;
}

export interface Argument {
  type: "logical_argument" | "debate_claim";
  claim: string;
  speaker: string;
  timestamp: string;
}

export interface VideoAnalysis {
  title: string;
  url: string;
  executive_summary: string;
  linkable_timestamps: LinkableTimestamp[];
  themes_and_topics: ThemesAndTopics;
  theological_topics: string[];
  key_points: string[];
  keywords: string[];
  transcription?: string;
  minute_by_minute: MinuteEntry[];
  scripture_references: ScriptureReference[];
  all_scripture_references: ScriptureReference[];
  entities: string[];
  arguments: Argument[];
  debate_claims: Argument[];
  speaker_name?: string;
  channel_name?: string;
}

export async function analyzeTranscript(transcriptText: string, videoUrl: string, videoTitle: string): Promise<VideoAnalysis> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following video transcript and extract the following features in a structured format. 

    ### SYSTEM ROLE
    You are an expert in Qur’an structure, Hadith collections (Bukhari, Muslim, etc.), Bible structure, Dawah, interfaith debates, and comparative theology. Your task is to detect scripture and knowledge references inside transcript segments with high accuracy.

    ### OBJECTIVE
    For each transcript segment, detect whether the speaker:
    1. Quoted scripture or a Hadith directly (exact_quote)
    2. Mentioned a reference explicitly (explicit_reference)
    3. Paraphrased a known verse or Hadith (close_paraphrase)
    4. Expressed a theological idea strongly tied to a known reference (thematic_reference)

    ### SCRIPTURE & KNOWLEDGE DETECTION RULES
    - **Semantic Matching:** Do NOT rely on exact text. Match meaning even if wording differs significantly (e.g., "there is no compulsion in religion" -> Quran 2:256).
    - **Context Window:** Use surrounding text to improve accuracy.
    - **Normalization:** Normalize all references.
        - Quran: Q_Surah_Ayah (e.g., Q_2_256).
        - Hadith: H_Collection_Number (e.g., H_Bukhari_1).
        - Bible: B_Book_Chapter_Verse (e.g., B_John_3_16).
    - **Match Types & Confidence Scoring:**
        - exact_quote (0.95 - 1.0): Word-for-word citation from a recognized translation (e.g., KJV, Sahih International).
        - explicit_reference (0.9 - 0.95): Speaker explicitly names the book/surah and chapter/verse.
        - close_paraphrase (0.75 - 0.85): Core meaning and sentence structure are preserved, despite minor wording variations.
        - thematic_reference (0.6 - 0.75): Discussion of a specific theological concept uniquely tied to a passage (e.g., "The Word was with God" -> John 1:1) without direct citation.
    - **Topic Alignment:** Inherit relevant topic tags from the matched reference.
    - **Accuracy First:** Only return matches with confidence > 0.6. If no strong match, return null or omit.

    ### KNOWLEDGE BASE CONTEXT (HIGH PRIORITY)
    - **Quran:** 2:255 (Ayatul Kursi), 2:256 (No compulsion), 3:64 (Common word), 4:157 (Crucifixion), 4:171 (Trinity/Jesus), 5:72-73 (Divinity of Christ), 112:1-4 (Tawhid), 5:48 (Competing in goodness), 16:125 (Invite to the way of your Lord).
    - **Hadith:** Bukhari 1 (Intentions), Muslim 1 (Iman/Islam/Ihsan), 40 Hadith Nawawi, Hadith on the treatment of neighbors, Hadith on seeking knowledge.
    - **Bible:** John 1:1 (The Word), John 14:28 (Father is greater), John 10:30 (I and Father are one), Mark 12:29 (Shema), Deuteronomy 6:4, Isaiah 43:10-11, Matthew 5 (Sermon on the Mount), 1 Corinthians 13 (Love).

    ### FEATURES TO EXTRACT
    1. Executive Summary: A high-level overview.
    2. Linkable Timestamps: Key moments with timestamps (MM:SS) and descriptions. **CRITICAL:** Include any detected 'scripture_references' within each timestamp segment.
    3. Themes & Topics: Overarching message and categories.
    4. Theological Topics: List of topics (e.g., Trinity, Tawhid).
    5. Key Points: Essential facts or arguments.
    6. Keywords: Relevant tags.
    7. Minute-by-Minute: Detailed breakdown for EVERY MINUTE.
    8. Scripture References: A top-level list of the most significant references found.
    9. All Scripture References: A consolidated list of ALL detected references across the entire video.
    10. Entities: People, religions, books, scriptures, locations.
    11. Arguments: Logical arguments.
    12. Debate Claims: Major claims in debates.
    13. Speaker Name: Identify the main speaker(s).
    14. Channel Name: Identify the YouTube channel.
    
    Transcript:
    ${transcriptText}
    
    Video URL: ${videoUrl}
    Video Title: ${videoTitle}
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executive_summary: { type: Type.STRING },
          linkable_timestamps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                description: { type: Type.STRING },
                scripture_references: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      reference_type: { type: Type.STRING },
                      reference: { type: Type.STRING },
                      reference_key: { type: Type.STRING },
                      match_type: { type: Type.STRING },
                      confidence_score: { type: Type.NUMBER },
                      evidence_text: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                      topic_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                      verse_text: { type: Type.STRING },
                      surah: { type: Type.NUMBER },
                      ayah: { type: Type.NUMBER },
                      surah_name: { type: Type.STRING },
                      book: { type: Type.STRING },
                      chapter: { type: Type.NUMBER },
                      verse: { type: Type.NUMBER },
                    },
                    required: ["reference_type", "reference", "reference_key", "match_type", "confidence_score", "evidence_text", "explanation", "topic_tags"],
                  },
                },
              },
              required: ["time", "description"],
            },
          },
          themes_and_topics: {
            type: Type.OBJECT,
            properties: {
              overarching_message: { type: Type.STRING },
              categories: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["overarching_message", "categories"],
          },
          theological_topics: { type: Type.ARRAY, items: { type: Type.STRING } },
          key_points: { type: Type.ARRAY, items: { type: Type.STRING } },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          minute_by_minute: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timestamp: { type: Type.STRING },
                content: { type: Type.STRING },
              },
              required: ["timestamp", "content"],
            },
          },
          scripture_references: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                reference_type: { type: Type.STRING },
                reference: { type: Type.STRING },
                reference_key: { type: Type.STRING },
                match_type: { type: Type.STRING },
                confidence_score: { type: Type.NUMBER },
                evidence_text: { type: Type.STRING },
                explanation: { type: Type.STRING },
                topic_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                verse_text: { type: Type.STRING },
                surah: { type: Type.NUMBER },
                ayah: { type: Type.NUMBER },
                surah_name: { type: Type.STRING },
                book: { type: Type.STRING },
                chapter: { type: Type.NUMBER },
                verse: { type: Type.NUMBER },
              },
              required: ["reference_type", "reference", "reference_key", "match_type", "confidence_score", "evidence_text", "explanation", "topic_tags"],
            },
          },
          all_scripture_references: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                reference_type: { type: Type.STRING },
                reference: { type: Type.STRING },
                reference_key: { type: Type.STRING },
                match_type: { type: Type.STRING },
                confidence_score: { type: Type.NUMBER },
                evidence_text: { type: Type.STRING },
                explanation: { type: Type.STRING },
                topic_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                verse_text: { type: Type.STRING },
                surah: { type: Type.NUMBER },
                ayah: { type: Type.NUMBER },
                surah_name: { type: Type.STRING },
                book: { type: Type.STRING },
                chapter: { type: Type.NUMBER },
                verse: { type: Type.NUMBER },
              },
              required: ["reference_type", "reference", "reference_key", "match_type", "confidence_score", "evidence_text", "explanation", "topic_tags"],
            },
          },
          entities: { type: Type.ARRAY, items: { type: Type.STRING } },
          arguments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                claim: { type: Type.STRING },
                speaker: { type: Type.STRING },
                timestamp: { type: Type.STRING },
              },
              required: ["type", "claim", "speaker", "timestamp"],
            },
          },
          debate_claims: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                claim: { type: Type.STRING },
                speaker: { type: Type.STRING },
                timestamp: { type: Type.STRING },
              },
              required: ["claim", "speaker", "timestamp"],
            },
          },
          speaker_name: { type: Type.STRING },
          channel_name: { type: Type.STRING },
        },
        required: ["executive_summary", "linkable_timestamps", "themes_and_topics", "theological_topics", "key_points", "keywords", "minute_by_minute", "scripture_references", "all_scripture_references", "entities", "arguments", "debate_claims", "speaker_name", "channel_name"],
      },
    },
  });

  try {
    const result = JSON.parse(response.text || "{}");
    return { 
      ...result, 
      title: videoTitle, 
      url: videoUrl, 
      transcription: transcriptText 
    };
  } catch (e) {
    console.error("Failed to parse Gemini response", e);
    return { 
      title: videoTitle,
      url: videoUrl,
      executive_summary: "", 
      linkable_timestamps: [], 
      themes_and_topics: { overarching_message: "", categories: [] }, 
      theological_topics: [],
      key_points: [], 
      keywords: [], 
      transcription: transcriptText, 
      minute_by_minute: [],
      scripture_references: [],
      all_scripture_references: [],
      entities: [],
      arguments: [],
      debate_claims: [],
      speaker_name: "Unknown",
      channel_name: "Unknown"
    };
  }
}

export async function generateAltTranscript(url: string, title: string): Promise<VideoAnalysis> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `The transcript for this YouTube video is disabled. I need you to analyze the video content using the provided URL and your internal knowledge. 
    Extract the following features in a structured format.

    ### SYSTEM ROLE
    You are an expert in Qur’an structure, Hadith collections (Bukhari, Muslim, etc.), Bible structure, Dawah, interfaith debates, and comparative theology. Your task is to detect scripture and knowledge references inside transcript segments with high accuracy.

    ### OBJECTIVE
    For each transcript segment, detect whether the speaker:
    1. Quoted scripture or a Hadith directly (exact_quote)
    2. Mentioned a reference explicitly (explicit_reference)
    3. Paraphrased a known verse or Hadith (close_paraphrase)
    4. Expressed a theological idea strongly tied to a known reference (thematic_reference)

    ### SCRIPTURE & KNOWLEDGE DETECTION RULES
    - **Semantic Matching:** Do NOT rely on exact text. Match meaning even if wording differs significantly (e.g., "there is no compulsion in religion" -> Quran 2:256).
    - **Context Window:** Use surrounding text to improve accuracy.
    - **Normalization:** Normalize all references.
        - Quran: Q_Surah_Ayah (e.g., Q_2_256).
        - Hadith: H_Collection_Number (e.g., H_Bukhari_1).
        - Bible: B_Book_Chapter_Verse (e.g., B_John_3_16).
    - **Match Types & Confidence Scoring:**
        - exact_quote (0.95 - 1.0): Word-for-word citation from a recognized translation (e.g., KJV, Sahih International).
        - explicit_reference (0.9 - 0.95): Speaker explicitly names the book/surah and chapter/verse.
        - close_paraphrase (0.75 - 0.85): Core meaning and sentence structure are preserved, despite minor wording variations.
        - thematic_reference (0.6 - 0.75): Discussion of a specific theological concept uniquely tied to a passage (e.g., "The Word was with God" -> John 1:1) without direct citation.
    - **Topic Alignment:** Inherit relevant topic tags from the matched reference.
    - **Accuracy First:** Only return matches with confidence > 0.6. If no strong match, return null or omit.

    ### KNOWLEDGE BASE CONTEXT (HIGH PRIORITY)
    - **Quran:** 2:255 (Ayatul Kursi), 2:256 (No compulsion), 3:64 (Common word), 4:157 (Crucifixion), 4:171 (Trinity/Jesus), 5:72-73 (Divinity of Christ), 112:1-4 (Tawhid), 5:48 (Competing in goodness), 16:125 (Invite to the way of your Lord).
    - **Hadith:** Bukhari 1 (Intentions), Muslim 1 (Iman/Islam/Ihsan), 40 Hadith Nawawi, Hadith on the treatment of neighbors, Hadith on seeking knowledge.
    - **Bible:** John 1:1 (The Word), John 14:28 (Father is greater), John 10:30 (I and Father are one), Mark 12:29 (Shema), Deuteronomy 6:4, Isaiah 43:10-11, Matthew 5 (Sermon on the Mount), 1 Corinthians 13 (Love).

    ### FEATURES TO EXTRACT
    1. Executive Summary: A high-level overview.
    2. Linkable Timestamps: Key moments with ESTIMATED timestamps (MM:SS) and descriptions. **CRITICAL:** Include any detected 'scripture_references' within each timestamp segment.
    3. Themes & Topics: Overarching message and categories.
    4. Theological Topics: List of topics (e.g., Trinity, Tawhid).
    5. Key Points: Essential facts or arguments.
    6. Keywords: Relevant tags.
    7. Transcription: Provide a detailed, minute-by-minute reconstruction of the video's dialogue or narrative. Format it with timestamps like [0s] text, [60s] text, etc.
    8. Minute-by-Minute: Detailed breakdown for EVERY MINUTE.
    9. Scripture References: A top-level list of the most significant references found.
    10. All Scripture References: A consolidated list of ALL detected references across the entire video.
    11. Entities: People, religions, books, scriptures, locations.
    12. Arguments: Logical arguments.
    13. Debate Claims: Major claims in debates.
    14. Speaker Name: Identify the main speaker(s).
    15. Channel Name: Identify the YouTube channel.
    
    Video URL: ${url}
    Video Title: ${title}
    `,
    config: {
      tools: [{ urlContext: {} }],
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executive_summary: { type: Type.STRING },
          linkable_timestamps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                time: { type: Type.STRING },
                description: { type: Type.STRING },
                scripture_references: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      reference_type: { type: Type.STRING },
                      reference: { type: Type.STRING },
                      reference_key: { type: Type.STRING },
                      match_type: { type: Type.STRING },
                      confidence_score: { type: Type.NUMBER },
                      evidence_text: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                      topic_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                      verse_text: { type: Type.STRING },
                      surah: { type: Type.NUMBER },
                      ayah: { type: Type.NUMBER },
                      surah_name: { type: Type.STRING },
                      book: { type: Type.STRING },
                      chapter: { type: Type.NUMBER },
                      verse: { type: Type.NUMBER },
                    },
                    required: ["reference_type", "reference", "reference_key", "match_type", "confidence_score", "evidence_text", "explanation", "topic_tags"],
                  },
                },
              },
              required: ["time", "description"],
            },
          },
          themes_and_topics: {
            type: Type.OBJECT,
            properties: {
              overarching_message: { type: Type.STRING },
              categories: { type: Type.ARRAY, items: { type: Type.STRING } },
            },
            required: ["overarching_message", "categories"],
          },
          theological_topics: { type: Type.ARRAY, items: { type: Type.STRING } },
          key_points: { type: Type.ARRAY, items: { type: Type.STRING } },
          keywords: { type: Type.ARRAY, items: { type: Type.STRING } },
          transcription: { type: Type.STRING },
          minute_by_minute: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                timestamp: { type: Type.STRING },
                content: { type: Type.STRING },
              },
              required: ["timestamp", "content"],
            },
          },
          scripture_references: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                reference_type: { type: Type.STRING },
                reference: { type: Type.STRING },
                reference_key: { type: Type.STRING },
                match_type: { type: Type.STRING },
                confidence_score: { type: Type.NUMBER },
                evidence_text: { type: Type.STRING },
                explanation: { type: Type.STRING },
                topic_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                verse_text: { type: Type.STRING },
                surah: { type: Type.NUMBER },
                ayah: { type: Type.NUMBER },
                surah_name: { type: Type.STRING },
                book: { type: Type.STRING },
                chapter: { type: Type.NUMBER },
                verse: { type: Type.NUMBER },
              },
              required: ["reference_type", "reference", "reference_key", "match_type", "confidence_score", "evidence_text", "explanation", "topic_tags"],
            },
          },
          all_scripture_references: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                reference_type: { type: Type.STRING },
                reference: { type: Type.STRING },
                reference_key: { type: Type.STRING },
                match_type: { type: Type.STRING },
                confidence_score: { type: Type.NUMBER },
                evidence_text: { type: Type.STRING },
                explanation: { type: Type.STRING },
                topic_tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                verse_text: { type: Type.STRING },
                surah: { type: Type.NUMBER },
                ayah: { type: Type.NUMBER },
                surah_name: { type: Type.STRING },
                book: { type: Type.STRING },
                chapter: { type: Type.NUMBER },
                verse: { type: Type.NUMBER },
              },
              required: ["reference_type", "reference", "reference_key", "match_type", "confidence_score", "evidence_text", "explanation", "topic_tags"],
            },
          },
          entities: { type: Type.ARRAY, items: { type: Type.STRING } },
          arguments: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                type: { type: Type.STRING },
                claim: { type: Type.STRING },
                speaker: { type: Type.STRING },
                timestamp: { type: Type.STRING },
              },
              required: ["type", "claim", "speaker", "timestamp"],
            },
          },
          debate_claims: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                claim: { type: Type.STRING },
                speaker: { type: Type.STRING },
                timestamp: { type: Type.STRING },
              },
              required: ["claim", "speaker", "timestamp"],
            },
          },
          speaker_name: { type: Type.STRING },
          channel_name: { type: Type.STRING },
        },
        required: ["executive_summary", "linkable_timestamps", "themes_and_topics", "theological_topics", "key_points", "keywords", "transcription", "minute_by_minute", "scripture_references", "all_scripture_references", "entities", "arguments", "debate_claims", "speaker_name", "channel_name"],
      },
    },
  });

  try {
    const result = JSON.parse(response.text || "{}");
    return { ...result, title, url };
  } catch (e) {
    console.error("Failed to parse Gemini alt response", e);
    return { 
      title,
      url,
      executive_summary: "", 
      linkable_timestamps: [], 
      themes_and_topics: { overarching_message: "", categories: [] }, 
      theological_topics: [],
      key_points: [], 
      keywords: [], 
      transcription: "",
      minute_by_minute: [],
      scripture_references: [],
      all_scripture_references: [],
      entities: [],
      arguments: [],
      debate_claims: [],
      speaker_name: "Unknown",
      channel_name: "Unknown"
    };
  }
}
export async function translateVideoAnalysis(analysis: VideoAnalysis, targetLang: string): Promise<VideoAnalysis> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Translate the following video analysis into ${targetLang}. 
    Maintain the JSON structure exactly as provided. 
    Translate all text values, including summaries, descriptions, topics, and key points. 
    Do NOT translate technical IDs, URLs, or timestamps.
    
    Analysis to translate:
    ${JSON.stringify(analysis)}
    `,
    config: {
      responseMimeType: "application/json",
    },
  });

  try {
    const translated = JSON.parse(response.text || "{}");
    return { ...analysis, ...translated };
  } catch (e) {
    console.error("Failed to parse translation response", e);
    return analysis;
  }
}
