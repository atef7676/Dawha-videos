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
  reference_type: "quran" | "bible";
  reference: string;
  match_type: "exact_quote" | "explicit_reference" | "close_paraphrase" | "thematic_reference" | "uncertain";
  confidence_score: number;
  evidence_text: string;
  explanation: string;
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
    You are an expert in Qur’an structure, Bible structure, Dawah, interfaith debates, and comparative theology. Your task is to detect scripture references inside transcript segments with high accuracy.

    ### OBJECTIVE
    For each transcript segment, detect whether the speaker:
    1. Quoted scripture directly (exact_quote)
    2. Mentioned a scripture reference explicitly (explicit_reference)
    3. Paraphrased a known verse (close_paraphrase)
    4. Expressed a theological idea strongly tied to a known verse (thematic_reference)

    ### SCRIPTURE DETECTION RULES
    - **Normalization:** Normalize all references (e.g., "Quran 112:1", "John 1:1").
    - **Quran Rules:** Use Surah:Ayah format. Detect even if only the name of the Surah is mentioned with a clear verse paraphrase. Be very sensitive to common Dawah verses (e.g., 2:255, 3:64, 4:171, 5:72, 5:73, 112:1-4).
    - **Bible Rules:** Use Book Chapter:Verse format. Be very sensitive to common interfaith debate verses (e.g., John 1:1, John 14:28, John 10:30, Mark 12:29, Deuteronomy 6:4).
    - **Match Types:**
        - exact_quote: Word-for-word citation.
        - explicit_reference: Mentioning the chapter/verse numbers.
        - close_paraphrase: Rephrasing the verse while maintaining its specific structure.
        - thematic_reference: Discussing the specific content of a verse without naming it.
    - **Confidence Scoring:**
        - exact_quote: 0.95 - 1.0
        - explicit_reference: 0.9 - 0.95
        - close_paraphrase: 0.7 - 0.85
        - thematic_reference: 0.5 - 0.7
        - uncertain: < 0.5
    - **Theological Context Boost:** If the video is about "Tawhid", "Trinity", or "Jesus divinity", increase sensitivity for related verses.
    - **Accuracy First:** Do not fabricate references. If unsure, mark as "uncertain" or omit if confidence is very low.

    ### FEATURES TO EXTRACT
    1. Executive Summary: A high-level overview.
    2. Linkable Timestamps: Key moments with timestamps (MM:SS) and descriptions. **CRITICAL:** Include any detected 'scripture_references' within each timestamp segment.
    3. Themes & Topics: Overarching message and categories.
    4. Theological Topics: List of topics (e.g., Trinity, Tawhid).
    5. Key Points: Essential facts or arguments.
    6. Keywords: Relevant tags.
    7. Minute-by-Minute: Detailed breakdown for EVERY MINUTE.
    8. Scripture References: A top-level list of the most significant scripture references found.
    9. All Scripture References: A consolidated list of ALL detected references across the entire video.
    10. Entities: People, religions, books, scriptures, locations.
    11. Arguments: Logical arguments.
    12. Debate Claims: Major claims in debates.
    13. Speaker Name: Identify the main speaker(s) from the transcript or title.
    14. Channel Name: Identify the YouTube channel if mentioned or inferred.
    
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
                      match_type: { type: Type.STRING },
                      confidence_score: { type: Type.NUMBER },
                      evidence_text: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                      verse_text: { type: Type.STRING },
                      surah: { type: Type.NUMBER },
                      ayah: { type: Type.NUMBER },
                      surah_name: { type: Type.STRING },
                      book: { type: Type.STRING },
                      chapter: { type: Type.NUMBER },
                      verse: { type: Type.NUMBER },
                    },
                    required: ["reference_type", "reference", "match_type", "confidence_score", "evidence_text", "explanation"],
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
                match_type: { type: Type.STRING },
                confidence_score: { type: Type.NUMBER },
                evidence_text: { type: Type.STRING },
                explanation: { type: Type.STRING },
                verse_text: { type: Type.STRING },
                surah: { type: Type.NUMBER },
                ayah: { type: Type.NUMBER },
                surah_name: { type: Type.STRING },
                book: { type: Type.STRING },
                chapter: { type: Type.NUMBER },
                verse: { type: Type.NUMBER },
              },
              required: ["reference_type", "reference", "match_type", "confidence_score", "evidence_text", "explanation"],
            },
          },
          all_scripture_references: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                reference_type: { type: Type.STRING },
                reference: { type: Type.STRING },
                match_type: { type: Type.STRING },
                confidence_score: { type: Type.NUMBER },
                evidence_text: { type: Type.STRING },
                explanation: { type: Type.STRING },
                verse_text: { type: Type.STRING },
                surah: { type: Type.NUMBER },
                ayah: { type: Type.NUMBER },
                surah_name: { type: Type.STRING },
                book: { type: Type.STRING },
                chapter: { type: Type.NUMBER },
                verse: { type: Type.NUMBER },
              },
              required: ["reference_type", "reference", "match_type", "confidence_score", "evidence_text", "explanation"],
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
    You are an expert in Qur’an structure, Bible structure, Dawah, interfaith debates, and comparative theology. Your task is to detect scripture references inside transcript segments with high accuracy.

    ### OBJECTIVE
    For each transcript segment, detect whether the speaker:
    1. Quoted scripture directly (exact_quote)
    2. Mentioned a scripture reference explicitly (explicit_reference)
    3. Paraphrased a known verse (close_paraphrase)
    4. Expressed a theological idea strongly tied to a known verse (thematic_reference)

    ### SCRIPTURE DETECTION RULES
    - **Normalization:** Normalize all references (e.g., "Quran 112:1", "John 1:1").
    - **Quran Rules:** Use Surah:Ayah format. Detect even if only the name of the Surah is mentioned with a clear verse paraphrase. Be very sensitive to common Dawah verses (e.g., 2:255, 3:64, 4:171, 5:72, 5:73, 112:1-4).
    - **Bible Rules:** Use Book Chapter:Verse format. Be very sensitive to common interfaith debate verses (e.g., John 1:1, John 14:28, John 10:30, Mark 12:29, Deuteronomy 6:4).
    - **Match Types:**
        - exact_quote: Word-for-word citation.
        - explicit_reference: Mentioning the chapter/verse numbers.
        - close_paraphrase: Rephrasing the verse while maintaining its specific structure.
        - thematic_reference: Discussing the specific content of a verse without naming it.
    - **Confidence Scoring:**
        - exact_quote: 0.95 - 1.0
        - explicit_reference: 0.9 - 0.95
        - close_paraphrase: 0.7 - 0.85
        - thematic_reference: 0.5 - 0.7
        - uncertain: < 0.5
    - **Theological Context Boost:** If the video is about "Tawhid", "Trinity", or "Jesus divinity", increase sensitivity for related verses.
    - **Accuracy First:** Do not fabricate references. If unsure, mark as "uncertain" or omit if confidence is very low.

    ### FEATURES TO EXTRACT
    1. Executive Summary: A high-level overview.
    2. Linkable Timestamps: Key moments with ESTIMATED timestamps (MM:SS) and descriptions. **CRITICAL:** Include any detected 'scripture_references' within each timestamp segment.
    3. Themes & Topics: Overarching message and categories.
    4. Theological Topics: List of topics (e.g., Trinity, Tawhid).
    5. Key Points: Essential facts or arguments.
    6. Keywords: Relevant tags.
    7. Transcription: Provide a detailed, minute-by-minute reconstruction of the video's dialogue or narrative. Format it with timestamps like [0s] text, [60s] text, etc.
    8. Minute-by-Minute: Detailed breakdown for EVERY MINUTE.
    9. Scripture References: A top-level list of the most significant scripture references found.
    10. All Scripture References: A consolidated list of ALL detected references across the entire video.
    11. Entities: People, religions, books, scriptures, locations.
    12. Arguments: Logical arguments.
    13. Debate Claims: Major claims in debates.
    14. Speaker Name: Identify the main speaker(s) from the title or your knowledge.
    15. Channel Name: Identify the YouTube channel if known.
    
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
                      match_type: { type: Type.STRING },
                      confidence_score: { type: Type.NUMBER },
                      evidence_text: { type: Type.STRING },
                      explanation: { type: Type.STRING },
                      verse_text: { type: Type.STRING },
                      surah: { type: Type.NUMBER },
                      ayah: { type: Type.NUMBER },
                      surah_name: { type: Type.STRING },
                      book: { type: Type.STRING },
                      chapter: { type: Type.NUMBER },
                      verse: { type: Type.NUMBER },
                    },
                    required: ["reference_type", "reference", "match_type", "confidence_score", "evidence_text", "explanation"],
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
                match_type: { type: Type.STRING },
                confidence_score: { type: Type.NUMBER },
                evidence_text: { type: Type.STRING },
                explanation: { type: Type.STRING },
                verse_text: { type: Type.STRING },
                surah: { type: Type.NUMBER },
                ayah: { type: Type.NUMBER },
                surah_name: { type: Type.STRING },
                book: { type: Type.STRING },
                chapter: { type: Type.NUMBER },
                verse: { type: Type.NUMBER },
              },
              required: ["reference_type", "reference", "match_type", "confidence_score", "evidence_text", "explanation"],
            },
          },
          all_scripture_references: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                reference_type: { type: Type.STRING },
                reference: { type: Type.STRING },
                match_type: { type: Type.STRING },
                confidence_score: { type: Type.NUMBER },
                evidence_text: { type: Type.STRING },
                explanation: { type: Type.STRING },
                verse_text: { type: Type.STRING },
                surah: { type: Type.NUMBER },
                ayah: { type: Type.NUMBER },
                surah_name: { type: Type.STRING },
                book: { type: Type.STRING },
                chapter: { type: Type.NUMBER },
                verse: { type: Type.NUMBER },
              },
              required: ["reference_type", "reference", "match_type", "confidence_score", "evidence_text", "explanation"],
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
