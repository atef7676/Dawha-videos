import { 
  collection, 
  getDocs, 
  addDoc, 
  query, 
  where, 
  updateDoc, 
  doc, 
  deleteDoc,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase';
import { quranService } from './quranService';

export const populateKnowledgeBaseFromVideos = async (userId: string) => {
  console.log("Populating Knowledge Base from videos...");
  
  let videosSnapshot;
  try {
    videosSnapshot = await getDocs(collection(db, 'videos'));
    console.log(`Found ${videosSnapshot.size} videos in videos.`);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'videos');
  }
  
  const videos = videosSnapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));

  if (videos.length === 0) {
    console.log("No videos found to process.");
    return;
  }

  for (const video of videos) {
    console.log(`Processing video: ${video.title}`);
    const { 
      topics = [], 
      keywords = [], 
      executive_summary, 
      key_points,
      all_scripture_references = []
    } = video as any;

    if (topics.length === 0) {
      console.log(`No topics found for video: ${video.title}`);
      continue;
    }

    // Map to store topic names to their Firestore IDs for this video
    const topicNameToId: Record<string, string> = {};

    // 1. Process Topics
    for (const topicName of topics) {
      console.log(`Processing topic: ${topicName}`);
      const normalizedName = topicName.toLowerCase().trim();
      
      // Get or Create Topic
      let topicSnapshot;
      try {
        const topicQuery = query(collection(db, 'knowledge_topics'), where('userId', '==', userId), where('normalized_name', '==', normalizedName));
        topicSnapshot = await getDocs(topicQuery);
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, 'knowledge_topics');
      }
      
      let topicId: string;
      if (topicSnapshot.empty) {
        console.log(`Creating new topic: ${topicName}`);
        try {
          const topicRef = await addDoc(collection(db, 'knowledge_topics'), {
            title: topicName,
            normalized_name: normalizedName,
            description: '',
            source: 'auto_generated',
            video_count: 1,
            userId,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
          topicId = topicRef.id;
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'knowledge_topics');
          continue;
        }
      } else {
        console.log(`Updating existing topic: ${topicName}`);
        topicId = topicSnapshot.docs[0].id;
        try {
          await updateDoc(doc(db, 'knowledge_topics', topicId), {
            video_count: increment(1),
            updatedAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `knowledge_topics/${topicId}`);
        }
      }

      topicNameToId[normalizedName] = topicId;

      // 2. Create Knowledge Entry for the video summary
      console.log(`Creating knowledge entry for topic: ${topicName}`);
      try {
        await addDoc(collection(db, 'knowledge_entries'), {
          title: `Main concept from video: ${video.title}`,
          type: 'video_summary',
          content: executive_summary || key_points?.join('\n') || 'No summary available.',
          topics: [topicId],
          keywords: keywords,
          video_id: video.id,
          source: 'video_index',
          confidence: 0.8,
          metadata: {
            video_id: video.id,
            videoUrl: video.url || `https://www.youtube.com/watch?v=${video.youtube_id || video.id}`
          },
          topicId: topicId,
          sourceType: 'video',
          sourceId: video.id,
          userId,
          createdAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'knowledge_entries');
      }

      // 3. Link Topic and Video
      console.log(`Linking topic ${topicName} to video ${video.title}`);
      try {
        await addDoc(collection(db, 'topic_video_map'), {
          topic_id: topicId,
          video_id: video.id,
          relevance_score: 0.9,
          userId,
          createdAt: serverTimestamp()
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, 'topic_video_map');
      }
    }

    // 4. Process Scripture References
    console.log(`Processing ${all_scripture_references.length} scripture references for video: ${video.title}`);
    for (const ref of all_scripture_references) {
      const { reference, explanation, evidence_text, topic_tags = [], reference_type } = ref;
      
      // Find which topics this scripture belongs to
      const linkedTopicIds = topic_tags
        .map((tag: string) => topicNameToId[tag.toLowerCase().trim()])
        .filter((id: string | undefined) => !!id);

      // If no topics matched from the video's main topics, we might want to skip or link to a general topic
      // For now, let's only link if there's a match to the video's topics
      if (linkedTopicIds.length > 0) {
        const quranLink = quranService.getQuranComLink(reference, reference_type);
        
        for (const topicId of linkedTopicIds) {
          console.log(`Creating scripture entry for topic ID: ${topicId}, ref: ${reference}`);
          try {
            await addDoc(collection(db, 'knowledge_entries'), {
              title: `Scripture Reference: ${reference}`,
              type: 'scripture',
              content: `${reference}: ${explanation}\n\n"${evidence_text}"`,
              topics: [topicId],
              topicId: topicId,
              sourceType: 'scripture',
              sourceId: video.id,
              metadata: {
                reference,
                explanation,
                evidence_text,
                reference_type,
                externalLink: quranLink,
                video_id: video.id,
                videoUrl: video.url || `https://www.youtube.com/watch?v=${video.youtube_id || video.id}`
              },
              userId,
              createdAt: serverTimestamp()
            });
          } catch (error) {
            handleFirestoreError(error, OperationType.CREATE, 'knowledge_entries');
          }
        }
      }
    }
  }
  console.log("Knowledge Base population complete.");
};

export const clearKnowledgeBase = async (userId: string) => {
  console.log("Clearing Knowledge Base...");
  
  const collectionsToClear = ['knowledge_topics', 'knowledge_entries', 'topic_video_map', 'taxonomy'];
  
  for (const collName of collectionsToClear) {
    try {
      const q = query(collection(db, collName), where('userId', '==', userId));
      const snapshot = await getDocs(q);
      console.log(`Deleting ${snapshot.size} documents from ${collName}`);
      
      const deletePromises = snapshot.docs.map(d => deleteDoc(doc(db, collName, d.id)));
      await Promise.all(deletePromises);
    } catch (error) {
      console.error(`Error clearing ${collName}:`, error);
      // Don't use handleFirestoreError here to avoid throwing and stopping the whole process
    }
  }
  
  console.log("Knowledge Base cleared.");
};
