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
        }
      } catch (e) {
        console.warn("Metadata fetch failed, using default title");
      }

      res.json({ transcript, title });
    } catch (error: any) {
      console.error("Transcript error:", error);
      
      // If transcript is disabled, we still want to try and get the title
      let title = "YouTube Video";
      try {
        const metaRes = await fetch(`https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`);
        if (metaRes.ok) {
          const meta = await metaRes.json();
          title = meta.title;
        }
      } catch (e) {}

      if (error.message && error.message.includes("Transcript is disabled")) {
        // Return a special flag so the frontend knows to use the AI fallback
        return res.json({ 
          transcript: null, 
          title,
          fallback: true,
          message: "Transcripts are disabled for this video. Switching to AI-generated alternative transcription..." 
        });
      }
      
      let errorMessage = "Failed to fetch transcript. Make sure the video has captions enabled.";
      if (error.message && error.message.includes("Could not find videoId")) {
        errorMessage = "Invalid YouTube URL. Please check the link and try again.";
      }
      
      res.status(500).json({ error: errorMessage });
    }
  });

  app.get("/api/search", (req, res) => {
    res.status(400).json({ error: "Search is now handled client-side via Firestore." });
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
