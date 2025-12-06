const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

const API_BASE_URL = "https://neokex-dl-apis.fly.dev/api/download";
const CACHE_DIR = path.join(__dirname, 'cache');

async function download({ videoUrl, message, event }) {
  const apiUrl = `${API_BASE_URL}?url=${encodeURIComponent(videoUrl)}`;
  
  let tempFilePath = null;
  
  try {
    const apiResponse = await axios.get(apiUrl, { timeout: 60000 });
    const data = apiResponse.data;

    if (!data || !data.success) {
      throw new Error(data?.error || "Failed to fetch media from API.");
    }
    
    const title = data.title || 'Media Download';
    const platform = data.platform || 'Unknown Source';
    const author = data.author || 'Unknown';
    const duration = data.duration || '';
    
    const downloadUrl = data.videoDownload || data.videoStream || data.audioDownload || data.audioStream;
    
    if (!downloadUrl) {
      throw new Error("No downloadable media URL found in API response.");
    }

    const isAudio = data.type === 'audio' || (!data.videoDownload && !data.videoStream);
    const fileExtension = isAudio ? 'mp3' : 'mp4';

    const mediaResponse = await axios.get(downloadUrl, {
      responseType: 'stream',
      timeout: 180000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': downloadUrl
      }
    });
    
    if (!fs.existsSync(CACHE_DIR)) {
      await fs.mkdirp(CACHE_DIR);
    }

    const safeTitle = title.substring(0, 30).replace(/[^a-z0-9]/gi, '_');
    const filename = `${Date.now()}_${safeTitle}.${fileExtension}`;
    tempFilePath = path.join(CACHE_DIR, filename);

    const writer = fs.createWriteStream(tempFilePath);
    mediaResponse.data.pipe(writer);

    await new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    let bodyMessage = `Download Complete\n`;
    bodyMessage += `Title: ${title}\n`;
    bodyMessage += `Platform: ${platform}`;
    if (author && author !== 'Unknown') bodyMessage += `\nAuthor: ${author}`;
    if (duration) bodyMessage += `\nDuration: ${duration}`;
    bodyMessage += `\nQuality: ${data.videoQuality || data.audioQuality || 'Best'}`;

    await message.reply({
      body: bodyMessage,
      attachment: fs.createReadStream(tempFilePath)
    });
    
    message.reaction("✅", event.messageID);

  } catch (error) {
    message.reaction("❌", event.messageID);
    
    console.error("Download Error:", error.message || error);
    
    let errorMsg = "Failed to download media.";
    if (error.response?.data?.error) {
      errorMsg = error.response.data.error;
    } else if (error.response?.data?.hint) {
      errorMsg += `\n${error.response.data.hint}`;
    } else if (error.message) {
      errorMsg = error.message;
    }
    
    await message.reply(errorMsg);
    
  } finally {
    if (tempFilePath && fs.existsSync(tempFilePath)) {
      await fs.unlink(tempFilePath).catch(console.error);
    }
  }
}

module.exports = {
  config: {
    name: "alldl",
    aliases: ["download", "dl", "instadl", "fbdl", "xdl", "tikdl", "ytdl", "pindl"],
    version: "3.0",
    author: "Neoaz ゐ",
    countDown: 5,
    role: 0,
    longDescription: "Download videos and audio from various platforms including TikTok, Instagram, Facebook, YouTube, Twitter/X, Pinterest, Threads, Spotify, SoundCloud, and more.",
    category: "media",
    guide: {
      en: {
        body: "{p}{n} [video/audio link]\n{p}{n} on/off - Toggle auto-download for this group\n\nSupported platforms: TikTok, Instagram, Facebook, YouTube, Twitter/X, Pinterest, Threads, Spotify, SoundCloud, CapCut, Douyin, Xiaohongshu, and more."
      }
    }
  },

  onStart: async function({ message, args, event, threadsData, role }) {
    let videoUrl = args.join(" ");
    const urlRegex = /(https?:\/\/[^\s]+)/g;

    const toggleCommand = args[0] === 'on' || args[0] === 'off';
    
    if (toggleCommand) {
      if (role >= 1) {
        const choice = args[0] === 'on';
        await threadsData.set(event.threadID, { data: { autoDownload: choice } });
        return message.reply(`Auto-download has been turned ${choice ? 'on' : 'off'} for this group.`);
      } else {
        return message.reply("You don't have permission to toggle auto-download.");
      }
    }

    if (!videoUrl) {
      if (event.messageReply && event.messageReply.body) {
        const foundURLs = event.messageReply.body.match(urlRegex);
        if (foundURLs && foundURLs.length > 0) {
          videoUrl = foundURLs[0];
        }
      }
    }

    if (!videoUrl || !videoUrl.match(urlRegex)) {
      return message.reply("Please provide a valid media URL or reply to a message containing one.\n\nUsage: .alldl [link]\n\nSupported: TikTok, Instagram, Facebook, YouTube, Twitter/X, Pinterest, Threads, Spotify, SoundCloud, and more.");
    }

    message.reaction("⏳", event.messageID);
    await download({ videoUrl, message, event });
  },

  onChat: async function({ event, message, threadsData }) {
    const threadData = await threadsData.get(event.threadID);
    if (!threadData || !threadData.data || !threadData.data.autoDownload || event.senderID === global.botID) return;

    try {
      const urlRegex = /(https?:\/\/[^\s]+)/g;
      const foundURLs = event.body.match(urlRegex);

      if (foundURLs && foundURLs.length > 0) {
        const supportedPatterns = [
          'tiktok.com', 'vm.tiktok.com',
          'instagram.com', 'instagr.am',
          'facebook.com', 'fb.watch', 'fb.com',
          'youtube.com', 'youtu.be', 'youtube.com/shorts',
          'twitter.com', 'x.com', 't.co',
          'pinterest.com', 'pin.it',
          'threads.net',
          'spotify.com', 'open.spotify.com',
          'soundcloud.com',
          'capcut.com',
          'douyin.com',
          'xiaohongshu.com', 'xhslink.com'
        ];
        
        const videoUrl = foundURLs[0];
        const isSupported = supportedPatterns.some(pattern => videoUrl.toLowerCase().includes(pattern));
        
        if (isSupported) {
          message.reaction("⏳", event.messageID);
          await download({ videoUrl, message, event });
        }
      }
    } catch (error) {
      console.error("onChat Auto-Download Error:", error);
    }
  }
};
