import { GoogleGenAI, Type } from "@google/genai";
import { withExponentialBackoff } from "../utils/backoff";

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

export interface EntityDetailed {
  name: string;
  type: 'scholar' | 'book' | 'other';
  description: string;
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
  entities_detailed: EntityDetailed[];
  arguments: Argument[];
  debate_claims: Argument[];
  speaker_name?: string;
  channel_name?: string;
  scholar?: string;
  madhab?: string;
  source_type?: string;
  era?: string;
}

function normalizeReferenceKey(key: string): string {
  if (!key) return "";
  let normalized = key.trim().toUpperCase().replace(/\s+/g, "_");
  
  // Quran: Q_Surah_Ayah (remove leading zeros)
  if (normalized.startsWith("Q_")) {
    const parts = normalized.split("_");
    if (parts.length >= 3) {
      const surah = parseInt(parts[1], 10);
      const ayah = parseInt(parts[2], 10);
      if (!isNaN(surah) && !isNaN(ayah)) {
        return `Q_${surah}_${ayah}`;
      }
    }
  }
  
  // Bible: B_Book_Chapter_Verse
  if (normalized.startsWith("B_")) {
    // Already mostly normalized by prompt, but ensure underscores
    return normalized;
  }

  // Hadith: H_Collection_Number
  if (normalized.startsWith("H_")) {
    return normalized;
  }

  return normalized;
}

export async function analyzeTranscript(
  transcriptText: string, 
  videoUrl: string, 
  videoTitle: string,
  onProgress?: (progress: number) => void
): Promise<VideoAnalysis> {
  // Split transcript into chunks of ~15 minutes to ensure full processing of long videos
  const CHUNK_SIZE_MS = 15 * 60 * 1000; // 15 minutes
  const timestampRegex = /\[(\d+(?:\.\d+)?)s\]/g;
  const segments = transcriptText.match(timestampRegex) || [];
  
  let lastTimestamp = 0;
  if (segments.length > 0) {
    const lastMatch = segments[segments.length - 1].match(/\[(\d+(?:\.\d+)?)s\]/);
    if (lastMatch) lastTimestamp = parseFloat(lastMatch[1]);
  }
  
  const totalDurationMs = lastTimestamp * 1000;

  if (totalDurationMs > CHUNK_SIZE_MS) {
    console.log(`Video duration (${totalDurationMs / 1000}s) exceeds chunk size. Processing in parts...`);
    const numChunks = Math.ceil(totalDurationMs / CHUNK_SIZE_MS);
    const chunkedResults: VideoAnalysis[] = [];

    // Split transcript by our float-aware regex
    const parts = transcriptText.split(/(\[(\d+(?:\.\d+)?)s\])/);
    
    for (let i = 0; i < numChunks; i++) {
      const startMs = i * CHUNK_SIZE_MS;
      const endMs = (i + 1) * CHUNK_SIZE_MS;
      
      let chunkTranscript = "";
      
      if (i === 0 && parts[0]) {
        chunkTranscript += parts[0];
      }

      for (let j = 1; j < parts.length; j += 3) {
        const fullTag = parts[j];
        const timeVal = parseFloat(parts[j + 1]);
        const content = parts[j + 2] || "";
        
        const timeMs = timeVal * 1000;
        const isLastChunk = i === numChunks - 1;
        if (timeMs >= startMs && (isLastChunk ? true : timeMs < endMs)) {
          chunkTranscript += `${fullTag}${content}`;
        }
      }

      if (chunkTranscript.trim()) {
        console.log(`Processing chunk ${i + 1}/${numChunks}...`);
        if (onProgress) {
          // Progress from 30% to 65% for chunks
          const chunkProgress = 30 + ((i / numChunks) * 35);
          onProgress(Math.round(chunkProgress));
        }
        const chunkAnalysis = await callGeminiForChunk(chunkTranscript, videoUrl, videoTitle, i + 1, numChunks);
        chunkedResults.push(chunkAnalysis);
      }
    }

    if (onProgress) onProgress(65);
    // Merge results
    const merged = await mergeAnalysisResults(chunkedResults, videoUrl, videoTitle, transcriptText);
    if (onProgress) onProgress(70);
    return merged;
  }

  if (onProgress) onProgress(45);
  // Standard processing for shorter videos
  const result = await callGeminiForChunk(transcriptText, videoUrl, videoTitle, 1, 1);
  if (onProgress) onProgress(70);
  return result;
}

async function callGeminiForChunk(transcriptText: string, videoUrl: string, videoTitle: string, chunkIdx: number, totalChunks: number): Promise<VideoAnalysis> {
  const isPartial = totalChunks > 1;
  const prompt = `Analyze the following video transcript ${isPartial ? `(Part ${chunkIdx} of ${totalChunks})` : ""} and extract the following features in a structured format. **CRITICAL:** Ensure you analyze the ENTIRE transcript provided, even if it is very long. Do not truncate your analysis.

    ### SYSTEM ROLE
    You are an expert in Qur’an structure, Hadith collections (Bukhari, Muslim, etc.), Bible structure, Dawah, interfaith debates, and comparative theology. Your task is to detect scripture and knowledge references inside transcript segments with high accuracy.

    ### OBJECTIVE
    For each transcript segment, detect whether the speaker:
    1. Quoted scripture or a Hadith directly (exact_quote)
    2. Mentioned a reference explicitly (explicit_reference)
    3. Paraphrased a known verse or Hadith (close_paraphrase)
    4. Expressed a theological idea strongly tied to a known reference (thematic_reference)

    ### SCRIPTURE & KNOWLEDGE DETECTION RULES
    - **Semantic Matching:** Do NOT rely on exact text. Match meaning even if wording differs significantly.
        - *Example:* "There is no compulsion in religion" -> Quran 2:256.
        - *Example:* "Love your neighbor as yourself" -> Mark 12:31.
    - **Paraphrase Detection:** Detect when a speaker summarizes or rewords a verse.
        - *Example:* "Jesus said he is the way to the Father" -> John 14:6.
        - *Example:* "God says He is closer to us than our jugular vein" -> Quran 50:16.
    - **Thematic Reference:** Detect when a specific theological doctrine is discussed that is anchored in a specific text.
        - *Example:* "The concept of the Comforter/Paraclete" -> John 14:16 or John 16:7.
        - *Example:* "The challenge to produce a surah like it" -> Quran 2:23.
        - *Example:* "The concept of Original Sin" -> Romans 5:12.
    - **Islamic Nuances:** Distinguish between Quranic verses and Hadith. Recognize common Arabic phrases (e.g., "Inna lillahi..." -> Quran 2:156). Recognize references to "The People of the Book" (Ahl al-Kitab).
    - **Biblical Nuances:** Recognize references to specific covenants (Abrahamic, Mosaic, New Covenant). Distinguish between Old and New Testament themes.
    - **Normalization:** Normalize all references into a robust 'reference_key'.
        - Quran: Q_Surah_Ayah (e.g., Q_2_255). No leading zeros.
        - Hadith: H_Collection_Number (e.g., H_Bukhari_1). Use: Bukhari, Muslim, AbuDawud, Tirmidhi, Nasai, IbnMajah.
        - Bible: B_Book_Chapter_Verse (e.g., B_John_3_16). Use standard English book names (e.g., Genesis, Exodus, Matthew, Romans).
    - **Match Types & Confidence Scoring:**
        - exact_quote (0.95 - 1.0): Word-for-word citation from a recognized translation.
        - explicit_reference (0.9 - 0.95): Speaker explicitly names the book/surah and chapter/verse.
        - close_paraphrase (0.75 - 0.85): Core meaning and sentence structure are preserved, despite minor wording variations.
        - thematic_reference (0.6 - 0.75): Discussion of a specific theological concept uniquely tied to a passage without direct citation.
    - **Topic Alignment:** Inherit relevant topic tags from the matched reference.
    - **Accuracy First:** Only return matches with confidence > 0.6. If no strong match, return null or omit.

    ### KNOWLEDGE BASE CONTEXT (HIGH PRIORITY)
    - **Quran:** 2:255 (Ayatul Kursi), 2:256 (No compulsion), 3:64 (Common word), 4:157 (Crucifixion denial), 4:171 (Jesus as Word/Spirit, not Trinity), 5:72-73 (Shirk/Trinity), 112:1-4 (Tawhid), 5:48 (Preserver/Criterion), 16:125 (Wisdom in Dawah), 33:40 (Seal of Prophets), 51:56 (Purpose of creation).
    - **Hadith:** Bukhari 1 (Niyyah), Muslim 1 (Hadith Jibril), 40 Hadith Nawawi, Hadith on 'The best of you is he who learns Quran', Hadith on 'I was sent to perfect good character'.
    - **Bible:** John 1:1 (Logos), John 14:28 (Subordination), John 10:30 (Unity of purpose vs essence), Mark 12:29 (Shema), Deuteronomy 6:4, Isaiah 43:10-11 (No god before/after), Matthew 5-7 (Sermon on the Mount), 1 Corinthians 13 (Love), Romans 5:12 (Original Sin), Galatians 3:13 (Curse of the law).

    ### FEATURES TO EXTRACT
    1. Executive Summary: A high-level overview of THIS PART of the video.
    2. Linkable Timestamps: Key moments with timestamps (MM:SS) and descriptions. **CRITICAL:** Include any detected 'scripture_references' within each timestamp segment.
    3. Themes & Topics: Overarching message and categories for THIS PART.
    4. Theological Topics: List of topics (e.g., Trinity, Tawhid).
    5. Key Points: Essential facts or arguments.
    6. Keywords: Relevant tags.
    7. Minute-by-Minute: Detailed breakdown for EVERY MINUTE in this transcript part. **CRITICAL:** Use the actual timestamps from the transcript (e.g., [900s] should be 15:00).
    8. Scripture References: A top-level list of the most significant references found in this part.
    9. All Scripture References: A consolidated list of ALL detected references across this part.
    10. Entities: People, religions, books, scriptures, locations.
    11. Arguments: Logical arguments.
    12. Debate Claims: Major claims in debates.
    13. Speaker Name: Identify the main speaker(s).
    14. Channel Name: Identify the YouTube channel.
    15. Entities Detailed: A list of detailed entities (Scholars, Books, etc.) found in the video. Format: {name, type: 'scholar'|'book'|'other', description}.
    16. Scholar: The name of the scholar, if mentioned.
    17. Madhab: The madhab (school of thought), if mentioned.
    18. Source Type: The type of source (e.g., video, book, lecture).
    19. Era: The historical era, if mentioned.
    
    Transcript:
    ${transcriptText}
    
    Video URL: ${videoUrl}
    Video Title: ${videoTitle}
    `;

  const response = await withExponentialBackoff(() => ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: prompt,
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
          scholar: { type: Type.STRING },
          madhab: { type: Type.STRING },
          source_type: { type: Type.STRING },
          era: { type: Type.STRING },
        },
        required: ["executive_summary", "linkable_timestamps", "themes_and_topics", "theological_topics", "key_points", "keywords", "minute_by_minute", "scripture_references", "all_scripture_references", "entities", "entities_detailed", "arguments", "debate_claims", "speaker_name", "channel_name", "scholar", "madhab", "source_type", "era"],
      },
    },
  }));

  try {
    const result = JSON.parse(response.text || "{}");
    
    // Normalize scripture reference keys
    if (result.scripture_references) {
      result.scripture_references = result.scripture_references.map((ref: any) => ({
        ...ref,
        reference_key: normalizeReferenceKey(ref.reference_key)
      }));
    }
    if (result.all_scripture_references) {
      result.all_scripture_references = result.all_scripture_references.map((ref: any) => ({
        ...ref,
        reference_key: normalizeReferenceKey(ref.reference_key)
      }));
    }
    if (result.linkable_timestamps) {
      result.linkable_timestamps = result.linkable_timestamps.map((ts: any) => ({
        ...ts,
        scripture_references: ts.scripture_references?.map((ref: any) => ({
          ...ref,
          reference_key: normalizeReferenceKey(ref.reference_key)
        }))
      }));
    }

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
      entities_detailed: [],
      arguments: [],
      debate_claims: [],
      speaker_name: "Unknown",
      channel_name: "Unknown"
    };
  }
}

async function mergeAnalysisResults(results: VideoAnalysis[], url: string, title: string, fullTranscript: string): Promise<VideoAnalysis> {
  if (results.length === 0) {
    throw new Error("No analysis results were generated for the video chunks.");
  }
  // Combine all arrays
  const merged: VideoAnalysis = {
    title,
    url,
    executive_summary: results.map(r => r.executive_summary).join("\n\n"),
    linkable_timestamps: results.flatMap(r => r.linkable_timestamps),
    themes_and_topics: {
      overarching_message: results.map(r => r.themes_and_topics.overarching_message).join(" "),
      categories: Array.from(new Set(results.flatMap(r => r.themes_and_topics.categories)))
    },
    theological_topics: Array.from(new Set(results.flatMap(r => r.theological_topics))),
    key_points: results.flatMap(r => r.key_points),
    keywords: Array.from(new Set(results.flatMap(r => r.keywords))),
    transcription: fullTranscript,
    minute_by_minute: results.flatMap(r => r.minute_by_minute),
    scripture_references: results.flatMap(r => r.scripture_references),
    all_scripture_references: results.flatMap(r => r.all_scripture_references),
    entities: Array.from(new Set(results.flatMap(r => r.entities))),
    entities_detailed: results.flatMap(r => r.entities_detailed),
    arguments: results.flatMap(r => r.arguments),
    debate_claims: results.flatMap(r => r.debate_claims),
    speaker_name: results[0]?.speaker_name || "Unknown",
    channel_name: results[0]?.channel_name || "Unknown"
  };

  // Final pass to refine global summary and overarching message
  const finalResponse = await withExponentialBackoff(() => ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `The following is a merged analysis of a long video processed in parts. 
    Please provide a final, cohesive Executive Summary and Overarching Message for the entire video.
    **CRITICAL:** Ensure the summary reflects the full duration of the video and does not truncate any major sections.
    
    Merged Executive Summaries:
    ${merged.executive_summary}
    
    Merged Overarching Messages:
    ${merged.themes_and_topics.overarching_message}
    
    Video Title: ${title}
    `,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          executive_summary: { type: Type.STRING },
          overarching_message: { type: Type.STRING }
        },
        required: ["executive_summary", "overarching_message"]
      }
    }
  }));

  try {
    const finalResult = JSON.parse(finalResponse.text || "{}");
    merged.executive_summary = finalResult.executive_summary;
    merged.themes_and_topics.overarching_message = finalResult.overarching_message;
  } catch (e) {
    console.error("Failed to parse final merge response", e);
  }

  return merged;
}

export async function generateAltTranscript(
  url: string, 
  title: string,
  onProgress?: (progress: number) => void
): Promise<VideoAnalysis> {
  if (onProgress) onProgress(35);
  
  const response = await withExponentialBackoff(() => ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: `The transcript for this YouTube video is disabled. I need you to analyze the video content using the provided URL and your internal knowledge. 
    Extract the following features in a structured format. 

    **CRITICAL INSTRUCTION ON DURATION:** 
    You MUST analyze the ENTIRE video length. If the video is 60 minutes long, your analysis MUST cover all 60 minutes. 
    Do NOT stop after 10 or 15 minutes. 
    Your 'minute_by_minute' breakdown MUST continue until the very end of the video.
    Your 'linkable_timestamps' MUST include points from the beginning, middle, and end of the video.
    If you are unsure of the exact length, assume it is a long-form video and provide at least 40-60 minutes of breakdown if the content allows.

    ### SYSTEM ROLE
    You are an expert in Qur’an structure, Hadith collections (Bukhari, Muslim, etc.), Bible structure, Dawah, interfaith debates, and comparative theology. Your task is to detect scripture and knowledge references inside transcript segments with high accuracy.

    ### OBJECTIVE
    For each transcript segment, detect whether the speaker:
    1. Quoted scripture or a Hadith directly (exact_quote)
    2. Mentioned a reference explicitly (explicit_reference)
    3. Paraphrased a known verse or Hadith (close_paraphrase)
    4. Expressed a theological idea strongly tied to a known reference (thematic_reference)

    ### SCRIPTURE & KNOWLEDGE DETECTION RULES
    - **Semantic Matching:** Do NOT rely on exact text. Match meaning even if wording differs significantly.
        - *Example:* "There is no compulsion in religion" -> Quran 2:256.
        - *Example:* "Love your neighbor as yourself" -> Mark 12:31.
    - **Paraphrase Detection:** Detect when a speaker summarizes or rewords a verse.
        - *Example:* "Jesus said he is the way to the Father" -> John 14:6.
        - *Example:* "God says He is closer to us than our jugular vein" -> Quran 50:16.
    - **Thematic Reference:** Detect when a specific theological doctrine is discussed that is anchored in a specific text.
        - *Example:* "The concept of the Comforter/Paraclete" -> John 14:16 or John 16:7.
        - *Example:* "The challenge to produce a surah like it" -> Quran 2:23.
        - *Example:* "The concept of Original Sin" -> Romans 5:12.
    - **Islamic Nuances:** Distinguish between Quranic verses and Hadith. Recognize common Arabic phrases (e.g., "Inna lillahi..." -> Quran 2:156). Recognize references to "The People of the Book" (Ahl al-Kitab).
    - **Biblical Nuances:** Recognize references to specific covenants (Abrahamic, Mosaic, New Covenant). Distinguish between Old and New Testament themes.
    - **Normalization:** Normalize all references into a robust 'reference_key'.
        - Quran: Q_Surah_Ayah (e.g., Q_2_255). No leading zeros.
        - Hadith: H_Collection_Number (e.g., H_Bukhari_1). Use: Bukhari, Muslim, AbuDawud, Tirmidhi, Nasai, IbnMajah.
        - Bible: B_Book_Chapter_Verse (e.g., B_John_3_16). Use standard English book names (e.g., Genesis, Exodus, Matthew, Romans).
    - **Match Types & Confidence Scoring:**
        - exact_quote (0.95 - 1.0): Word-for-word citation from a recognized translation.
        - explicit_reference (0.9 - 0.95): Speaker explicitly names the book/surah and chapter/verse.
        - close_paraphrase (0.75 - 0.85): Core meaning and sentence structure are preserved, despite minor wording variations.
        - thematic_reference (0.6 - 0.75): Discussion of a specific theological concept uniquely tied to a passage without direct citation.
    - **Topic Alignment:** Inherit relevant topic tags from the matched reference.
    - **Accuracy First:** Only return matches with confidence > 0.6. If no strong match, return null or omit.

    ### KNOWLEDGE BASE CONTEXT (HIGH PRIORITY)
    - **Quran:** 2:255 (Ayatul Kursi), 2:256 (No compulsion), 3:64 (Common word), 4:157 (Crucifixion denial), 4:171 (Jesus as Word/Spirit, not Trinity), 5:72-73 (Shirk/Trinity), 112:1-4 (Tawhid), 5:48 (Preserver/Criterion), 16:125 (Wisdom in Dawah), 33:40 (Seal of Prophets), 51:56 (Purpose of creation).
    - **Hadith:** Bukhari 1 (Niyyah), Muslim 1 (Hadith Jibril), 40 Hadith Nawawi, Hadith on 'The best of you is he who learns Quran', Hadith on 'I was sent to perfect good character'.
    - **Bible:** John 1:1 (Logos), John 14:28 (Subordination), John 10:30 (Unity of purpose vs essence), Mark 12:29 (Shema), Deuteronomy 6:4, Isaiah 43:10-11 (No god before/after), Matthew 5-7 (Sermon on the Mount), 1 Corinthians 13 (Love), Romans 5:12 (Original Sin), Galatians 3:13 (Curse of the law).

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
  }));

  if (onProgress) onProgress(65);

  try {
    const result = JSON.parse(response.text || "{}");

    // Normalize scripture reference keys
    if (result.scripture_references) {
      result.scripture_references = result.scripture_references.map((ref: any) => ({
        ...ref,
        reference_key: normalizeReferenceKey(ref.reference_key)
      }));
    }
    if (result.all_scripture_references) {
      result.all_scripture_references = result.all_scripture_references.map((ref: any) => ({
        ...ref,
        reference_key: normalizeReferenceKey(ref.reference_key)
      }));
    }
    if (result.linkable_timestamps) {
      result.linkable_timestamps = result.linkable_timestamps.map((ts: any) => ({
        ...ts,
        scripture_references: ts.scripture_references?.map((ref: any) => ({
          ...ref,
          reference_key: normalizeReferenceKey(ref.reference_key)
        }))
      }));
    }

    if (onProgress) onProgress(70);
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
      entities_detailed: [],
      arguments: [],
      debate_claims: [],
      speaker_name: "Unknown",
      channel_name: "Unknown"
    };
  }
}
export async function translateVideoAnalysis(analysis: VideoAnalysis, targetLang: string): Promise<VideoAnalysis> {
  const response = await withExponentialBackoff(() => ai.models.generateContent({
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
  }));

  try {
    const translated = JSON.parse(response.text || "{}");
    return { ...analysis, ...translated };
  } catch (e) {
    console.error("Failed to parse translation response", e);
    return analysis;
  }
}
