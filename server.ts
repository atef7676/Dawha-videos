import express from "express";
import { createServer as createViteServer } from "vite";
import { YoutubeTranscript } from 'youtube-transcript';
import path from "path";
import ytsr from 'ytsr';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/channel-videos", async (req, res) => {
    const { channelUrl, page = 1 } = req.query;
    if (!channelUrl) return res.status(400).json({ error: "Channel URL is required" });

    try {
      const results = await ytsr(channelUrl as string, { limit: 10 * Number(page) });
      const videos = results.items.filter(item => item.type === 'video');
      res.json(videos);
    } catch (error) {
      console.error("Channel fetch error:", error);
      res.status(500).json({ error: "Failed to fetch channel videos" });
    }
  });

  app.get("/api/video-metadata", async (req, res) => {
    const { url } = req.query;
    if (!url) return res.status(400).json({ error: "URL is required" });

    try {
      // Use ytsr to fetch video metadata
      const results = await ytsr(url as string, { limit: 1 });
      const video = results.items.find(item => item.type === 'video');
      if (!video) return res.status(404).json({ error: "Video not found" });
      res.json(video);
    } catch (error) {
      console.error("Metadata fetch error:", error);
      res.status(500).json({ error: "Failed to fetch video metadata" });
    }
  });

  app.get("/api/search", (req, res) => {
    res.status(400).json({ error: "Search is now handled client-side via Firestore." });
  });

  app.post("/api/transcript", async (req, res) => {
    const { url } = req.body;
    try {
      const transcript = await YoutubeTranscript.fetchTranscript(url);
      
      // Also try to get title for better indexing
      let title = "YouTube Video";
      try {
        const metaRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (metaRes.ok) {
          const meta = await metaRes.json();
          title = meta.title;
        } else {
          // Fallback to ytsr for title
          const searchResults = await ytsr(url, { limit: 1 });
          const video = searchResults.items.find(item => item.type === 'video');
          if (video && 'title' in video) {
            title = (video as any).title;
          }
        }
      } catch (e) {
        console.warn("Metadata fetch failed, trying ytsr...");
        try {
          const searchResults = await ytsr(url, { limit: 1 });
          const video = searchResults.items.find(item => item.type === 'video');
          if (video && 'title' in video) {
            title = (video as any).title;
          }
        } catch (innerE) {
          console.warn("ytsr title fetch also failed");
        }
      }

      res.json({ transcript, title });
    } catch (error: any) {
      console.error("Transcript error:", error);
      
      // If transcript is disabled or any other error occurs, we still want to try and get the title
      let title = "YouTube Video";
      try {
        const metaRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (metaRes.ok) {
          const meta = await metaRes.json();
          title = meta.title;
        } else {
          const searchResults = await ytsr(url, { limit: 1 });
          const video = searchResults.items.find(item => item.type === 'video');
          if (video && 'title' in video) {
            title = (video as any).title;
          }
        }
      } catch (e) {
        try {
          const searchResults = await ytsr(url, { limit: 1 });
          const video = searchResults.items.find(item => item.type === 'video');
          if (video && 'title' in video) {
            title = (video as any).title;
          }
        } catch (innerE) {}
      }

      // Return a special flag so the frontend knows to use the AI fallback
      // This handles "Transcript is disabled" and any other fetching failure
      let message = "Automatic transcript fetch failed. Switching to AI-generated alternative transcription...";
      
      if (error.message && error.message.includes("too many requests")) {
        message = "YouTube is rate-limiting transcript requests. Switching to AI-generated alternative transcription (this is more reliable for large batches)...";
      } else if (error.message && error.message.includes("disabled")) {
        message = "Transcripts are disabled for this video. Switching to AI-generated alternative transcription...";
      }

      return res.json({ 
        transcript: null, 
        title,
        fallback: true,
        message
      });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
