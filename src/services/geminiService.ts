import { GoogleGenAI, Type } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

export interface Segment {
  topic: string;
  start_time: number;
  end_time: number;
  summary: string;
}

export interface MinuteEntry {
  timestamp: string;
  content: string;
}

export interface LinkableTimestamp {
  time: string;
  description: string;
}

export interface ThemesAndTopics {
  overarching_message: string;
  categories: string[];
}

export interface ScriptureReference {
  reference_type: "quran" | "bible";
  reference: string;
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
  entities: string[];
  arguments: Argument[];
  debate_claims: Argument[];
}

export async function analyzeTranscript(transcriptText: string, videoUrl: string, videoTitle: string): Promise<VideoAnalysis> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `Analyze the following video transcript and extract the following features in a structured format:
    1. Executive Summary: A high-level overview of the video content.
    2. Linkable Timestamps: A list of key moments with their timestamps (MM:SS) and brief descriptions.
    3. Themes & Topics: An overarching message and a list of categories.
    4. Theological Topics: A list of theological topics discussed (e.g., Trinity, Tawhid, etc.).
    5. Key Points: A list of essential facts or arguments.
    6. Keywords: A list of relevant tags.
    7. Minute-by-Minute: A detailed breakdown for EVERY MINUTE.
    8. Scripture References: Detect Qur’an and Bible citations. You must detect 300+ known verses, even when speakers paraphrase them or use non-exact wording. If a reference is clear but paraphrased, map it to the canonical verse. Normalize all references to a standard format (e.g., "Quran 112:1", "John 1:1"). Include the actual text of the verse in 'verse_text'.
    9. Entities: Detect people, religions, books, scriptures, locations.
    10. Arguments: Extract logical arguments.
    11. Debate Claims: Capture major claims in debates.
    
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
                verse_text: { type: Type.STRING },
                surah: { type: Type.NUMBER },
                ayah: { type: Type.NUMBER },
                surah_name: { type: Type.STRING },
                book: { type: Type.STRING },
                chapter: { type: Type.NUMBER },
                verse: { type: Type.NUMBER },
              },
              required: ["reference_type", "reference", "verse_text"],
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
        },
        required: ["executive_summary", "linkable_timestamps", "themes_and_topics", "theological_topics", "key_points", "keywords", "minute_by_minute", "scripture_references", "entities", "arguments", "debate_claims"],
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
      entities: [],
      arguments: [],
      debate_claims: []
    };
  }
}

export async function generateAltTranscript(url: string, title: string): Promise<VideoAnalysis> {
  const response = await ai.models.generateContent({
    model: "gemini-3-flash-preview",
    contents: `The transcript for this YouTube video is disabled. I need you to analyze the video content using the provided URL and your internal knowledge. 
    Extract the following features in a structured format:
    1. Executive Summary: A high-level overview of the video content.
    2. Linkable Timestamps: A list of key moments with ESTIMATED timestamps (MM:SS) and brief descriptions.
    3. Themes & Topics: An overarching message and a list of categories.
    4. Theological Topics: A list of theological topics discussed (e.g., Trinity, Tawhid, etc.).
    5. Key Points: A list of essential facts or arguments.
    6. Keywords: A list of relevant tags.
    7. Transcription: Provide a detailed, minute-by-minute reconstruction of the video's dialogue or narrative. Format it with timestamps like [0s] text, [60s] text, etc.
    8. Minute-by-Minute: A structured breakdown for EVERY MINUTE.
    9. Scripture References: Detect Qur’an and Bible citations. You must detect 300+ known verses, even when speakers paraphrase them or use non-exact wording. If a reference is clear but paraphrased, map it to the canonical verse. Normalize all references to a standard format (e.g., "Quran 112:1", "John 1:1"). Include the actual text of the verse in 'verse_text'.
    10. Entities: Detect people, religions, books, scriptures, locations.
    11. Arguments: Extract logical arguments.
    12. Debate Claims: Capture major claims in debates.
    
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
                verse_text: { type: Type.STRING },
                surah: { type: Type.NUMBER },
                ayah: { type: Type.NUMBER },
                surah_name: { type: Type.STRING },
                book: { type: Type.STRING },
                chapter: { type: Type.NUMBER },
                verse: { type: Type.NUMBER },
              },
              required: ["reference_type", "reference", "verse_text"],
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
        },
        required: ["executive_summary", "linkable_timestamps", "themes_and_topics", "theological_topics", "key_points", "keywords", "transcription", "minute_by_minute", "scripture_references", "entities", "arguments", "debate_claims"],
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
      entities: [],
      arguments: [],
      debate_claims: []
    };
  }
}
