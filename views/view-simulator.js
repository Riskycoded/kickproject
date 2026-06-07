const loadEnv = require('../load-env');
loadEnv();

const axios = require('axios');
const proxyClient = require('../proxy-client');

// Parse stream variant (index-160p.m3u8 etc.) from master.m3u8 content
function parseVariantPlaylist(masterM3u8Text) {
  if (typeof masterM3u8Text !== 'string') return null;
  const lines = masterM3u8Text.split('\n');
  let lowestQualityUrl = null;
  let lowestResolution = Infinity;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('#EXT-X-STREAM-INF:')) {
      const match = line.match(/RESOLUTION=(\d+)x(\d+)/i);
      const res = match ? parseInt(match[2]) : 1080;
      const nextLine = lines[i + 1]?.trim();
      if (nextLine && nextLine.endsWith('.m3u8')) {
        if (res < lowestResolution) {
          lowestResolution = res;
          lowestQualityUrl = nextLine;
        }
      }
    }
  }

  // Fallback to first .m3u8 found if no resolution matched
  if (!lowestQualityUrl) {
    for (const line of lines) {
      if (line.endsWith('.m3u8')) {
        return line;
      }
    }
  }

  return lowestQualityUrl;
}

// Parse .ts segments from a variant playlist text
function parseSegments(playlistText) {
  if (typeof playlistText !== 'string') return [];
  const lines = playlistText.split('\n');
  const segments = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && (trimmed.endsWith('.ts') || trimmed.includes('.ts?'))) {
      segments.push(trimmed);
    }
  }
  return segments;
}

async function simulateWatch(channelId, playbackUrl) {
  console.log(`[HLS Viewbot] Initializing watch simulation for channel: ${channelId}...`);

  // Fallback to mock API if no playback URL is provided (e.g. offline testing or local mock orders)
  if (!playbackUrl) {
    const apiEndpoint = process.env.KOPECHKA_API_URL || 'https://kopechka.com/api';
    const apiKey = process.env.KOPECHKA_API_KEY || 'kp_da9be0b1bf94c68b043c5cf82816f26235aaacdbe039f94800a4fea5cb607284';
    
    console.log(`[HLS Viewbot] No playback URL provided. Falling back to API simulation.`);
    const response = await axios.post(`${apiEndpoint}/watch`, {
      channel_id: channelId,
    }, {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 5000
    });

    for (let i = 0; i < 5; i++) {
      const streamResponse = await axios.get(`${apiEndpoint}/stream/${channelId}?timestamp=${Date.now()}`, { timeout: 5000 });
      console.log(`[HLS Viewbot] Simulating heartbeat at timestamp: ${streamResponse.data.timestamp || Date.now()}`);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    return response;
  }

  // Real HLS downloading loop using proxyClient!
  try {
    console.log(`[HLS Viewbot] Fetching master playlist: ${playbackUrl}`);
    const masterRes = await proxyClient.get(playbackUrl, { timeout: 10000 });
    const variantPath = parseVariantPlaylist(masterRes.data);

    if (!variantPath) {
      throw new Error('No quality variant found in master playlist.');
    }

    const baseUrl = playbackUrl.substring(0, playbackUrl.lastIndexOf('/'));
    const variantUrl = variantPath.startsWith('http') ? variantPath : `${baseUrl}/${variantPath}`;
    console.log(`[HLS Viewbot] Target lowest resolution stream variant: ${variantUrl}`);

    const downloadedSegments = new Set();
    const startTime = Date.now();
    const durationMs = 30000; // Simulate watching for 30 seconds

    while (Date.now() - startTime < durationMs) {
      console.log(`[HLS Viewbot] Updating stream playlist...`);
      const playlistRes = await proxyClient.get(variantUrl, { timeout: 8000 });
      const segments = parseSegments(playlistRes.data);
      const newSegments = segments.filter(s => !downloadedSegments.has(s));

      console.log(`[HLS Viewbot] Found ${newSegments.length} new video segment(s) to fetch.`);

      for (const segment of newSegments) {
        const segmentUrl = segment.startsWith('http') ? segment : `${variantUrl.substring(0, variantUrl.lastIndexOf('/'))}/${segment}`;
        try {
          console.log(`[HLS Viewbot] Fetching chunk: ${segment.split('?')[0]}`);
          // Fetch the .ts chunk (using arraybuffer to simulate real download)
          await proxyClient.get(segmentUrl, { responseType: 'arraybuffer', timeout: 8000 });
          downloadedSegments.add(segment);
        } catch (segmentErr) {
          console.warn(`[HLS Viewbot] Failed to download video segment: ${segmentErr.message}`);
        }
      }

      // Wait 4 seconds before fetching the next playlist updates
      await new Promise(resolve => setTimeout(resolve, 4500));
    }

    console.log(`[HLS Viewbot] Watch simulation completed for ${channelId}. Downloaded ${downloadedSegments.size} video chunks.`);
    return { status: 200, data: { success: true, message: 'Simulated HLS stream download successfully' } };
  } catch (err) {
    console.error(`[HLS Viewbot] Real HLS download failed: ${err.message}`);
    throw err;
  }
}

module.exports = simulateWatch;