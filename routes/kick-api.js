const express = require('express');
const router = express.Router();
const axios = require('axios');
const crypto = require('crypto');
const kickApiService = require('../Services/kickApiService');
const proxyClient = require('../proxy-client');

// Simple in-memory token cache
let cachedAppToken = null;
let tokenExpiresAt = 0;

// PKCE store: state -> code_verifier
const pkceStore = new Map();

// Active Kick User Session
let activeKickUserSession = null;

/**
 * Helper to fetch a valid App Access Token (Client Credentials flow)
 */
async function getAppAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  // If we have a cached token that isn't expired yet (with a 60-second buffer), use it
  if (cachedAppToken && tokenExpiresAt > now + 60) {
    return cachedAppToken;
  }

  try {
    const clientId = process.env.KICK_CLIENT_ID;
    const clientSecret = process.env.KICK_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Kick Developer credentials are not configured in environment variables (.env)');
    }

    const response = await axios.post(`${kickApiService.oauthBaseUrl}/oauth/token`,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const { access_token, expires_in } = response.data;
    cachedAppToken = access_token;
    tokenExpiresAt = Math.floor(Date.now() / 1000) + expires_in;

    return cachedAppToken;
  } catch (error) {
    console.error('Error fetching App Access Token from Kick OAuth:', error.response ? error.response.data : error.message);
    throw new Error('OAuth authentication with Kick server failed');
  }
}

/**
 * Route: GET /api/kick/livestreams
 * Fetches active Kick livestreams.
 */
router.get('/livestreams', async (req, res) => {
  try {
    const token = await getAppAccessToken();
    const streams = await kickApiService.getLivestreams(token, req.query);
    return res.json(streams);
  } catch (error) {
    console.error('Failed to retrieve livestreams:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Route: GET /api/kick/livestreams/stats
 * Fetches general statistics for Kick livestreams.
 */
router.get('/livestreams/stats', async (req, res) => {
  try {
    const token = await getAppAccessToken();
    const stats = await kickApiService.getLivestreamStats(token);
    return res.json(stats);
  } catch (error) {
    console.error('Failed to retrieve livestream stats:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

/**
 * Helper to fetch channel data via public v2 internal API (uses Decodo rotating proxy)
 */
async function fetchChannelV2(slug) {
  const url = `https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`;
  const response = await proxyClient.get(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept': 'application/json'
    },
    timeout: 5000
  });
  
  const data = response.data;
  if (!data || !data.slug) {
    throw new Error('Invalid channel data structure returned from public API');
  }
  
  const profilePicture = data.user?.profile_pic || data.user?.profile_picture || data.user?.avatar || 'https://kick.com/img/default-profile-pictures/default2.jpeg';
  const followersCount = data.followersCount || data.followers_count || 0;
  
  const channelInfo = {
    id: data.id || data.user_id,
    slug: data.slug,
    followers_count: followersCount,
    profile_picture: profilePicture,
    banner_picture: data.banner_image?.url || data.banner_picture || profilePicture
  };
  
  let livestream = null;
  const live = data.livestream;
  if (live && live.is_live !== false) {
    let category = null;
    if (Array.isArray(live.categories) && live.categories.length > 0) {
      category = {
        id: live.categories[0].id,
        name: live.categories[0].name
      };
    } else if (live.category) {
      category = live.category;
    }
    
    livestream = {
      thumbnail: live.thumbnail?.url || live.thumbnail || channelInfo.banner_picture,
      viewer_count: live.viewer_count || 0,
      stream_title: live.session_title || live.title || 'Untitled Stream',
      slug: data.slug,
      profile_picture: profilePicture,
      category: category,
      started_at: live.created_at || live.start_time || new Date().toISOString(),
      playback_url: live.playback_url
    };
  }
  
  return {
    channel: channelInfo,
    livestream: livestream,
    isLive: !!livestream
  };
}

/**
 * Route: GET /api/kick/channels/:slug
 * Resolves a channel's information and checks if it's currently live.
 */
router.get('/channels/:slug', async (req, res) => {
  const { slug } = req.params;
  
  try {
    // 1. Try querying Kick's public v2 API first via Decodo residential proxy
    const v2Result = await fetchChannelV2(slug);
    return res.json(v2Result);
  } catch (v2Error) {
    console.warn(`Public v2 channel lookup failed for "${slug}". Falling back to developer API:`, v2Error.message);
    
    try {
      const token = await getAppAccessToken();
      
      // 2. Fallback to developer API
      const response = await kickApiService.getChannel(token, slug);
      const channels = response.data || [];
      
      if (!Array.isArray(channels) || channels.length === 0) {
        return res.status(404).json({ error: `Channel "${slug}" not found` });
      }
      
      const channelData = channels[0];
      const stream = channelData.stream;
      const isLive = !!(stream && (stream.is_live === true || stream.viewer_count !== undefined));
      
      let livestream = null;
      if (isLive) {
        livestream = {
          thumbnail: stream.thumbnail || channelData.banner_picture,
          viewer_count: stream.viewer_count || 0,
          stream_title: channelData.stream_title || stream.stream_title || 'Untitled Stream',
          slug: channelData.slug,
          profile_picture: channelData.banner_picture,
          category: channelData.category,
          started_at: stream.start_time || stream.started_at || new Date().toISOString()
        };
      }

      return res.json({
        channel: channelData,
        livestream: livestream,
        isLive: isLive
      });
    } catch (devError) {
      console.error(`Failed to retrieve channel data for ${slug} via all methods:`, devError.message);
      return res.status(500).json({ error: devError.message });
    }
  }
});

/**
 * Route: GET /api/kick/auth/login
 * Starts the Kick OAuth2 code flow redirect with PKCE.
 */
router.get('/auth/login', async (req, res) => {
  // Support mock bypass query parameter
  if (req.query.mock === 'true') {
    const userId = req.query.userId;
    if (userId) {
      const KickAccountService = require('../Services/kickAccountService');
      const randomId = Math.floor(Math.random() * 10000);
      try {
        await KickAccountService.createKickAccount({
          userId,
          username: `mock_kick_user_${randomId}`,
          email: `mock_${randomId}@example.com`,
          credentials: {
            accessToken: `mock-token-${randomId}`,
            refreshToken: `mock-refresh-${randomId}`,
            expiresAt: new Date(Date.now() + 86400 * 1000)
          }
        });
        console.log(`[Mock OAuth] Created mock Kick account linked to user ID ${userId}`);
      } catch (dbErr) {
        console.error('[Mock OAuth] Failed to save mock Kick account:', dbErr.message);
      }
    } else {
      activeKickUserSession = {
        accessToken: 'mock-user-access-token-999',
        refreshToken: 'mock-refresh-token-999',
        expiresAt: Math.floor(Date.now() / 1000) + 86400,
        profile: {
          email: 'riskymixxye1@gmail.com',
          username: 'riskymixxye1',
          profilePicture: 'https://kick.com/img/default-profile-pictures/default2.jpeg',
          userId: 987654
        }
      };
      console.log('Bypassed Kick OAuth: Logged in using mock user.');
    }
    return res.redirect('/');
  }

  const clientId = process.env.KICK_CLIENT_ID;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const redirectUri = process.env.KICK_REDIRECT_URI || `${protocol}://${host}/api/kick/auth/callback`;

  console.log(`[OAuth login] Initiating auth. client_id=${clientId}, redirect_uri=${redirectUri}`);

  if (!clientId) {
    return res.status(500).json({ error: 'KICK_CLIENT_ID not configured in environment variables (.env)' });
  }

  // Generate PKCE code verifier and challenge
  const codeVerifier = crypto.randomBytes(32).toString('base64url');
  const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
  const state = crypto.randomBytes(16).toString('hex');

  // Store in memory mapping state to verifier and target user
  pkceStore.set(state, { codeVerifier, userId: req.query.userId });
  setTimeout(() => pkceStore.delete(state), 5 * 60 * 1000); // 5 min expiry

  const authUrl = new URL(`${kickApiService.oauthBaseUrl}/oauth/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  if (redirectUri.includes('127.0.0.1')) {
    authUrl.searchParams.set('redirect', '127.0.0.1');
  }
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'user:read');
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');
  authUrl.searchParams.set('state', state);

  console.log(`[OAuth login] Redirecting to authorization URL: ${authUrl.toString()}`);
  res.redirect(authUrl.toString());
});

/**
 * Route: GET /api/kick/auth/callback
 * Finishes the OAuth callback flow and retrieves user info.
 */
router.get('/auth/callback', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  console.log(`[OAuth callback] Received request with query params: code=${code ? 'present' : 'absent'}, state=${state}, error=${error}`);

  if (error) {
    return res.status(400).send(`OAuth Error from Kick: ${error} - ${error_description}`);
  }

  if (!code || !state) {
    return res.status(400).send('OAuth Error: Missing code or state parameters.');
  }

  const sessionData = pkceStore.get(state);
  if (!sessionData) {
    return res.status(400).send('OAuth Error: Invalid or expired state parameter.');
  }

  const { codeVerifier, userId } = sessionData;
  pkceStore.delete(state);
  
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const redirectUri = process.env.KICK_REDIRECT_URI || `${protocol}://${host}/api/kick/auth/callback`;

  try {
    console.log(`[OAuth callback] Exchanging code for access token using redirect_uri=${redirectUri}...`);
    const tokenData = await kickApiService.exchangeAuthorizationCode(code, redirectUri, codeVerifier);
    
    console.log('[OAuth callback] Fetching user profile from Kick API...');
    const userDataResponse = await kickApiService.getAuthenticatedUser(tokenData.access_token);
    const userProfile = userDataResponse.data && userDataResponse.data[0];

    if (!userProfile) {
      throw new Error('No user profile data received from Kick API.');
    }

    activeKickUserSession = {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      expiresAt: Math.floor(Date.now() / 1000) + (tokenData.expires_in || 3600),
      profile: {
        email: userProfile.email,
        username: userProfile.name,
        profilePicture: userProfile.profile_picture || 'https://kick.com/img/default-profile-pictures/default2.jpeg',
        userId: userProfile.user_id
      }
    };

    if (userId) {
      const KickAccountService = require('../Services/kickAccountService');
      try {
        await KickAccountService.createKickAccount({
          userId,
          username: userProfile.name,
          email: userProfile.email,
          credentials: {
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token,
            expiresAt: new Date(Date.now() + (tokenData.expires_in || 3600) * 1000)
          }
        });
        console.log(`[OAuth callback] Successfully linked Kick account ${userProfile.name} to user ID ${userId}`);
      } catch (dbErr) {
        console.error(`[OAuth callback] Failed to link Kick account to DB:`, dbErr.message);
      }
    }

    console.log(`[OAuth callback] Kick user ${userProfile.name} successfully logged in.`);
    res.redirect('/');
  } catch (err) {
    console.error('[OAuth callback] OAuth exchange failed:', err.message);
    res.status(500).send(`OAuth exchange failed: ${err.message}`);
  }
});

/**
 * Route: GET /api/kick/auth/me
 * Retrieves the currently logged-in Kick user profile.
 */
router.get('/auth/me', (req, res) => {
  if (!activeKickUserSession) {
    return res.json({ loggedIn: false, user: null });
  }

  const now = Math.floor(Date.now() / 1000);
  if (activeKickUserSession.expiresAt < now) {
    activeKickUserSession = null;
    return res.json({ loggedIn: false, user: null });
  }

  res.json({ loggedIn: true, user: activeKickUserSession.profile });
});

/**
 * Route: POST /api/kick/auth/logout
 * Logs out the active Kick user session.
 */
router.post('/auth/logout', (req, res) => {
  activeKickUserSession = null;
  res.json({ success: true, message: 'Logged out from Kick successfully.' });
});

// Mock categories dataset for offline/fallback environment
const MOCK_CATEGORIES = [
  { id: 101, name: 'Old School Runescape', thumbnail: 'https://kick.com/img/categories/old-school-runescape.jpeg', viewer_count: 4200, tags: ['MMORPG', 'RPG', 'Retro'] },
  { id: 102, name: 'Slots & Casino', thumbnail: 'https://kick.com/img/categories/slots.jpeg', viewer_count: 85000, tags: ['18+', 'Action', 'Casino'] },
  { id: 103, name: 'Just Chatting', thumbnail: 'https://kick.com/img/categories/just-chatting.jpeg', viewer_count: 145000, tags: ['IRL', 'Interactive', 'Chill'] },
  { id: 104, name: 'Grand Theft Auto V', thumbnail: 'https://kick.com/img/categories/gta5.jpeg', viewer_count: 22000, tags: ['Action', 'RPG', 'Shooter'] },
  { id: 105, name: 'Fortnite', thumbnail: 'https://kick.com/img/categories/fortnite.jpeg', viewer_count: 31000, tags: ['Shooter', 'Battle Royale', 'Action'] },
  { id: 106, name: 'Valorant', thumbnail: 'https://kick.com/img/categories/valorant.jpeg', viewer_count: 18000, tags: ['Shooter', 'Tactical', 'FPS'] },
  { id: 107, name: 'League of Legends', thumbnail: 'https://kick.com/img/categories/lol.jpeg', viewer_count: 25000, tags: ['MOBA', 'Strategy', 'Competitive'] },
  { id: 108, name: 'Counter-Strike 2', thumbnail: 'https://kick.com/img/categories/cs2.jpeg', viewer_count: 15000, tags: ['Shooter', 'Tactical', 'FPS'] }
];

/**
 * Helper to fetch any valid Kick authorization token
 */
async function getValidToken() {
  if (activeKickUserSession && activeKickUserSession.accessToken) {
    return activeKickUserSession.accessToken;
  }
  try {
    const KickAccount = require('../models/kickAccount');
    const account = await KickAccount.findOne({});
    if (account && account.credentials && account.credentials.accessToken) {
      return account.credentials.accessToken;
    }
  } catch (err) {}
  try {
    const appToken = await getAppAccessToken();
    if (appToken) return appToken;
  } catch (err) {}
  return 'mock-token';
}

/**
 * Route: GET /api/kick/categories/search
 * Searches Kick categories. Falls back to mock data if offline/unauthenticated.
 */
router.get('/categories/search', async (req, res) => {
  const query = req.query.q || '';
  if (!query) {
    return res.json({ data: [] });
  }

  try {
    const token = await getValidToken();
    if (token === 'mock-token') {
      throw new Error('Using mock token');
    }
    const result = await kickApiService.searchCategories(token, query);
    res.json(result);
  } catch (err) {
    const filtered = MOCK_CATEGORIES.filter(c => 
      c.name.toLowerCase().includes(query.toLowerCase())
    );
    res.json({
      data: filtered.map(c => ({
        id: c.id,
        name: c.name,
        thumbnail: c.thumbnail
      })),
      message: 'Filtered mock categories'
    });
  }
});

/**
 * Route: GET /api/kick/categories/:id
 * Fetches a single category details. Falls back to mock data if offline/unauthenticated.
 */
router.get('/categories/:id', async (req, res) => {
  const catId = parseInt(req.params.id);
  try {
    const token = await getValidToken();
    if (token === 'mock-token') {
      throw new Error('Using mock token');
    }
    const result = await kickApiService.getCategory(token, catId);
    res.json(result);
  } catch (err) {
    const category = MOCK_CATEGORIES.find(c => c.id === catId);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    res.json({
      data: category,
      message: 'Mock category detail'
    });
  }
});

/**
 * Route: GET /api/kick/categories
 * Lists top/filtered categories. Falls back to mock data if offline/unauthenticated.
 */
router.get('/categories', async (req, res) => {
  try {
    const token = await getValidToken();
    if (token === 'mock-token') {
      throw new Error('Using mock token');
    }
    const result = await kickApiService.getCategories(token, req.query);
    res.json(result);
  } catch (err) {
    res.json({
      data: MOCK_CATEGORIES,
      message: 'Mock categories list'
    });
  }
});

module.exports = router;
