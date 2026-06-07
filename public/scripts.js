document.addEventListener('DOMContentLoaded', () => {
  // Patch window.fetch to automatically inject Authorization headers
  const originalFetch = window.fetch;
  window.fetch = async (url, options = {}) => {
    const token = localStorage.getItem('voidkid_session_token');
    if (token) {
      options.headers = options.headers || {};
      if (options.headers instanceof Headers) {
        options.headers.set('Authorization', `Bearer ${token}`);
      } else if (Array.isArray(options.headers)) {
        options.headers.push(['Authorization', `Bearer ${token}`]);
      } else {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
    }
    
    const response = await originalFetch(url, options);
    
    // Automatically handle 401 Unauthorized (session expired/invalid)
    if (response.status === 401 && !url.includes('/api/auth/login')) {
      handleSessionExpired();
    }
    
    return response;
  };

  function handleSessionExpired() {
    localStorage.removeItem('voidkid_session_token');
    const authOverlay = document.getElementById('auth-overlay');
    const dashboard = document.getElementById('dashboard');
    if (authOverlay && dashboard) {
      authOverlay.style.display = 'flex';
      dashboard.style.display = 'none';
    }
  }

  // Handle Login form submit
  const loginForm = document.getElementById('login-panel-form');
  const authOverlay = document.getElementById('auth-overlay');
  const dashboard = document.getElementById('dashboard');
  const authError = document.getElementById('auth-error');

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      authError.style.display = 'none';
      
      const email = document.getElementById('login-email').value;
      const password = document.getElementById('login-password').value;
      
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });
        
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Authentication failed');
        }
        
        // Success
        localStorage.setItem('voidkid_session_token', data.token);
        authOverlay.style.display = 'none';
        dashboard.style.display = 'flex';
        
        // Load initial dashboard data
        loadDashboardData();
      } catch (err) {
        authError.textContent = err.message;
        authError.style.display = 'block';
      }
    });
  }

  // Handle Logout button click
  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
      } catch (err) {}
      
      handleSessionExpired();
    });
  }

  // Initial authentication check on page load
  const sessionToken = localStorage.getItem('voidkid_session_token');
  if (sessionToken) {
    if (authOverlay) authOverlay.style.display = 'none';
    if (dashboard) dashboard.style.display = 'flex';
    loadDashboardData();
  } else {
    if (authOverlay) authOverlay.style.display = 'flex';
    if (dashboard) dashboard.style.display = 'none';
  }

  // Navigation tab switcher
  const navItems = document.querySelectorAll('.nav-item');
  const tabPanes = document.querySelectorAll('.tab-pane');
  const pageTitle = document.getElementById('page-title');

  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const targetTab = item.getAttribute('data-tab');

      navItems.forEach(i => i.classList.remove('active'));
      tabPanes.forEach(pane => pane.classList.remove('active'));

      item.classList.add('active');
      document.getElementById(targetTab).classList.add('active');
      pageTitle.textContent = item.textContent.trim();
    });
  });

  // Fetch and display users
  async function fetchUsers() {
    const userTableBody = document.getElementById('user-table-body');
    try {
      const res = await fetch('/api/users');
      const data = await res.json();

      userTableBody.innerHTML = '';
      if (!Array.isArray(data) || data.length === 0) {
        userTableBody.innerHTML = '<tr><td colspan="4" class="loading-cell">No users registered yet.</td></tr>';
        return;
      }
      for (const user of data) {
        const row = document.createElement('tr');
        const accountsTd = document.createElement('td');
        accountsTd.innerHTML = '<span style="color: var(--text-muted); font-size:12px;">Loading accounts...</span>';
        
        row.innerHTML = `
          <td>${escapeHtml(user.username)}</td>
          <td>${escapeHtml(user.email)}</td>
          <td><code>${user._id}</code></td>
        `;
        row.appendChild(accountsTd);
        userTableBody.appendChild(row);

        fetchUserKickAccounts(user._id, accountsTd);
      }
    } catch (err) {
      userTableBody.innerHTML = `<tr><td colspan="4" class="loading-cell" style="color:var(--accent-red)">Error loading users: ${err.message}</td></tr>`;
    }
  }

  async function fetchUserKickAccounts(userId, containerTd) {
    try {
      const res = await fetch(`/api/kick-accounts/user/${userId}`);
      if (!res.ok) throw new Error('Failed to load');
      const accounts = await res.json();
      
      containerTd.innerHTML = '';
      
      const badgeList = document.createElement('div');
      badgeList.style.display = 'flex';
      badgeList.style.flexWrap = 'wrap';
      badgeList.style.gap = '6px';
      badgeList.style.alignItems = 'center';
      
      accounts.forEach(acc => {
        const badge = document.createElement('span');
        badge.className = 'account-badge';
        badge.style.display = 'inline-flex';
        badge.style.alignItems = 'center';
        badge.style.background = 'rgba(83, 252, 24, 0.1)';
        badge.style.border = '1px solid rgba(83, 252, 24, 0.3)';
        badge.style.color = '#53fc18';
        badge.style.padding = '3px 8px';
        badge.style.borderRadius = '12px';
        badge.style.fontSize = '12px';
        badge.style.fontWeight = '500';
        badge.style.gap = '6px';
        
        badge.innerHTML = `
          <span>${escapeHtml(acc.username)}</span>
          <button style="background:none; border:none; color:var(--accent-red); cursor:pointer; font-weight:bold; font-size:12px; padding:0; line-height:1;" onclick="unlinkKickAccount('${acc._id}', '${userId}')">×</button>
        `;
        badgeList.appendChild(badge);
      });
      
      const addBtn = document.createElement('button');
      addBtn.className = 'btn-secondary';
      addBtn.style.padding = '2px 8px';
      addBtn.style.fontSize = '11px';
      addBtn.style.borderRadius = '10px';
      addBtn.textContent = '+ Add Account';
      addBtn.addEventListener('click', () => {
        const useMock = confirm('Click OK to simulate a Mock Kick Account, or Cancel to perform a Live Kick OAuth link.');
        if (useMock) {
          window.location.href = `/api/kick/auth/login?userId=${userId}&mock=true`;
        } else {
          window.location.href = `/api/kick/auth/login?userId=${userId}`;
        }
      });
      
      badgeList.appendChild(addBtn);
      containerTd.appendChild(badgeList);
    } catch (err) {
      containerTd.innerHTML = `<span style="color:var(--accent-red); font-size:12px;">Error: ${err.message}</span>`;
    }
  }

  async function unlinkKickAccount(id, userId) {
    if (!confirm('Are you sure you want to unlink this Kick account?')) return;
    try {
      const res = await fetch(`/api/kick-accounts/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unlink account');
      
      fetchUsers();
    } catch (err) {
      alert('Error unlinking Kick account: ' + err.message);
    }
  }

  window.unlinkKickAccount = unlinkKickAccount;

  // Fetch metrics
  async function fetchMetrics() {
    try {
      const res = await fetch('/metrics');
      const text = await res.text();
      const accountsMatch = text.match(/http_requests_total\{[^}]*route="\/api\/auth\/register"[^}]*\} (\d+)/);
      const streamsMatch = text.match(/http_requests_total\{[^}]*route="\/api\/kick-accounts"[^}]*\} (\d+)/);
      document.getElementById('metric-accounts').textContent = accountsMatch ? accountsMatch[1] : '0';
      document.getElementById('metric-streams').textContent = streamsMatch ? streamsMatch[1] : '0';
    } catch (err) {
      console.error('Metrics error:', err.message);
    }
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // Register user toggle
  const addUserBtn = document.getElementById('add-user-btn');
  const regModal = document.getElementById('register-user-modal');
  const cancelRegBtn = document.getElementById('cancel-reg-btn');
  const registerForm = document.getElementById('register-form');

  addUserBtn.addEventListener('click', () => {
    regModal.style.display = regModal.style.display === 'none' ? 'block' : 'none';
  });
  cancelRegBtn.addEventListener('click', () => { regModal.style.display = 'none'; });

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: document.getElementById('reg-username').value,
          email: document.getElementById('reg-email').value,
          password: document.getElementById('reg-password').value
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Registration failed');
      regModal.style.display = 'none';
      registerForm.reset();
      fetchUsers();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  });

  // Simulation controls & real-time log polling
  const viewerBoostForm = document.getElementById('viewer-boost-form');
  const startViewersBtn = document.getElementById('start-viewers-btn');
  const stopViewersBtn = document.getElementById('stop-viewers-btn');
  const channelTargetInput = document.getElementById('channel-target');
  const viewerCountInput = document.getElementById('viewer-count');
  const followerCountInput = document.getElementById('follower-count');
  const commentCountInput = document.getElementById('comment-count');
  
  const viewerStatusPanel = document.getElementById('viewer-status-panel');
  const viewerStatusBadge = document.getElementById('viewer-status-badge');
  const viewerActiveChannel = document.getElementById('viewer-active-channel');
  const viewerActiveCount = document.getElementById('viewer-active-count');
  const followerActiveCount = document.getElementById('follower-active-count');
  const commentActiveCount = document.getElementById('comment-active-count');
  const viewerActiveStatus = document.getElementById('viewer-active-status');
  
  const consoleOutput = document.getElementById('console-output');
  const consoleStatus = document.getElementById('console-status');

  let logPollInterval = null;

  async function pollLogs() {
    try {
      const res = await fetch('/api/kickerz/viewbot/status');
      if (!res.ok) return;
      const data = await res.json();

      if (!consoleOutput) return;

      // Render logs
      consoleOutput.innerHTML = '';
      if (!data.logs || data.logs.length === 0) {
        consoleOutput.innerHTML = '<span class="console-line system">Waiting for process output logs...</span>';
      } else {
        data.logs.forEach(line => {
          const el = document.createElement('div');
          el.className = 'console-line';
          
          if (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') || line.includes('❌')) {
            el.className += ' error';
          } else if (line.includes('succeeded') || line.includes('✅') || line.includes('LIVE') || line.toLowerCase().includes('successfully') || line.includes('✔️')) {
            el.className += ' success';
          } else if (line.includes('Initializing') || line.includes('🚀') || line.includes('⏹') || line.includes('Stopping') || line.includes('Starting')) {
            el.className += ' system';
          }
          
          el.textContent = line;
          consoleOutput.appendChild(el);
        });
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
      }

      // Update Live Viewers UI
      if (data.active) {
        if (viewerStatusPanel) viewerStatusPanel.style.display = 'block';
        if (viewerActiveChannel) viewerActiveChannel.textContent = data.channel || '—';
        if (viewerActiveCount) viewerActiveCount.textContent = (data.stats ? data.stats.viewers : data.targetThreads) || '—';
        if (followerActiveCount) followerActiveCount.textContent = data.targetFollowers || '0';
        if (commentActiveCount) commentActiveCount.textContent = data.targetComments || '0';
        if (viewerActiveStatus) viewerActiveStatus.textContent = (data.stats && data.stats.status) || 'Running';
        
        if (viewerStatusBadge) {
          viewerStatusBadge.textContent = 'RUNNING';
          viewerStatusBadge.className = 'smm-status-badge in-progress';
        }

        if (consoleStatus) {
          consoleStatus.textContent = 'ACTIVE';
          consoleStatus.style.color = '#53fc18';
          consoleStatus.style.background = 'rgba(83, 252, 24, 0.1)';
          consoleStatus.style.border = '1px solid rgba(83, 252, 24, 0.3)';
        }
        
        if (startViewersBtn) startViewersBtn.style.display = 'none';
        if (stopViewersBtn) stopViewersBtn.style.display = 'inline-block';
        
        if (!logPollInterval) {
          logPollInterval = setInterval(pollLogs, 1500);
        }
      } else {
        if (viewerStatusPanel) viewerStatusPanel.style.display = 'none';
        if (consoleStatus) {
          consoleStatus.textContent = 'INACTIVE';
          consoleStatus.style.color = 'var(--text-muted)';
          consoleStatus.style.background = 'rgba(255,255,255,0.05)';
          consoleStatus.style.border = '1px solid rgba(255,255,255,0.1)';
        }
        if (startViewersBtn) {
          startViewersBtn.style.display = 'inline-block';
          startViewersBtn.disabled = false;
          startViewersBtn.textContent = '🚀 Start All-in-One Boost';
        }
        if (stopViewersBtn) stopViewersBtn.style.display = 'none';
        
        if (logPollInterval) {
          clearInterval(logPollInterval);
          logPollInterval = null;
        }
      }
    } catch (err) {
      console.error('Failed to poll logs:', err);
    }
  }

  if (viewerBoostForm) {
    viewerBoostForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const channel = channelTargetInput.value.trim();
      const countVal = parseInt(viewerCountInput.value) || 0;
      const followerVal = followerCountInput ? (parseInt(followerCountInput.value) || 0) : 0;
      const commentVal = commentCountInput ? (parseInt(commentCountInput.value) || 0) : 0;

      if (!channel) {
        alert('Please enter a target channel username.');
        return;
      }

      if (countVal === 0 && followerVal === 0 && commentVal === 0) {
        alert('Please enter a count greater than 0 for at least one boost service.');
        return;
      }

      try {
        if (startViewersBtn) {
          startViewersBtn.disabled = true;
          startViewersBtn.textContent = 'Initializing...';
        }

        const res = await fetch('/api/kickerz/viewbot/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            channel,
            threads: countVal,
            followers: followerVal,
            comments: commentVal
          })
        });

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to start boost');

        if (startViewersBtn) {
          startViewersBtn.disabled = false;
          startViewersBtn.textContent = '🚀 Start All-in-One Boost';
          startViewersBtn.style.display = 'none';
        }
        if (stopViewersBtn) {
          stopViewersBtn.style.display = 'inline-block';
          stopViewersBtn.disabled = false;
        }

        // Start live status and log polling
        if (logPollInterval) clearInterval(logPollInterval);
        pollLogs();
        logPollInterval = setInterval(pollLogs, 1500);

      } catch (err) {
        if (startViewersBtn) {
          startViewersBtn.disabled = false;
          startViewersBtn.textContent = '🚀 Start All-in-One Boost';
        }
        alert('Error starting boost: ' + err.message);
      }
    });
  }

  if (stopViewersBtn) {
    stopViewersBtn.addEventListener('click', async () => {
      try {
        stopViewersBtn.disabled = true;
        stopViewersBtn.textContent = 'Stopping...';

        const res = await fetch('/api/kickerz/viewbot/stop', { method: 'POST' });
        const data = await res.json();

        stopViewersBtn.disabled = false;
        stopViewersBtn.textContent = '⏹ Stop Boost Session';
        stopViewersBtn.style.display = 'none';
        if (startViewersBtn) startViewersBtn.style.display = 'inline-block';

        if (logPollInterval) {
          clearInterval(logPollInterval);
          logPollInterval = null;
        }
        pollLogs();
      } catch (err) {
        stopViewersBtn.disabled = false;
        stopViewersBtn.textContent = '⏹ Stop Boost Session';
        alert('Error stopping: ' + err.message);
      }
    });
  }

  // Dynamic channel preview lookup
  const channelPreviewCard = document.getElementById('channel-preview-card');
  const channelPreviewAvatar = document.getElementById('channel-preview-avatar');
  const channelPreviewName = document.getElementById('channel-preview-name');
  const channelPreviewFollowers = document.getElementById('channel-preview-followers');
  const channelPreviewStatus = document.getElementById('channel-preview-status');

  let previewTimeout = null;
  if (channelTargetInput) {
    channelTargetInput.addEventListener('input', () => {
      if (previewTimeout) clearTimeout(previewTimeout);
      const username = channelTargetInput.value.trim();
      if (!username) {
        if (channelPreviewCard) channelPreviewCard.style.display = 'none';
        return;
      }

      previewTimeout = setTimeout(async () => {
        try {
          const res = await fetch(`/api/kick/channels/${encodeURIComponent(username)}`);
          if (!res.ok) throw new Error('Channel not found');
          const data = await res.json();

          if (data && data.channel && channelPreviewCard) {
            const chan = data.channel;
            if (channelPreviewAvatar) {
              channelPreviewAvatar.src = chan.profile_picture || 'https://kick.com/img/default-profile-pictures/default2.jpeg';
            }
            if (channelPreviewName) {
              channelPreviewName.textContent = chan.slug || username;
            }
            if (channelPreviewFollowers) {
              channelPreviewFollowers.textContent = `${(chan.followers_count || 0).toLocaleString()} followers`;
            }
            if (channelPreviewStatus) {
              if (data.isLive) {
                channelPreviewStatus.textContent = 'LIVE';
                channelPreviewStatus.style.color = '#53fc18';
              } else {
                channelPreviewStatus.textContent = 'OFFLINE';
                channelPreviewStatus.style.color = 'var(--text-muted)';
              }
            }
            channelPreviewCard.style.display = 'flex';
          }
        } catch (err) {
          if (channelPreviewCard) channelPreviewCard.style.display = 'none';
        }
      }, 600);
    });
  }

  // On page load, auto-detect which viewer system is currently running
  async function detectRunningViewerSystem() {
    try {
      const resWeb = await fetch('/api/kickerz/viewbot/status');
      const dataWeb = await resWeb.json();
      if (dataWeb.active) {
        if (channelTargetInput) channelTargetInput.value = dataWeb.channel || '';
        if (viewerCountInput) viewerCountInput.value = dataWeb.targetThreads || 0;
        if (followerCountInput) followerCountInput.value = dataWeb.targetFollowers || 0;
        if (commentCountInput) commentCountInput.value = dataWeb.targetComments || 0;
        pollLogs();
      }
    } catch (e) {
      console.warn('Could not read viewer processes:', e.message);
    }
  }

  detectRunningViewerSystem();

  // Fetch active streams from our mock / proxy api endpoint
  async function fetchStreams() {
    const gridContainer = document.getElementById('streams-grid-container');
    const errorContainer = document.getElementById('streams-error-container');
    const totalCountEl = document.getElementById('total-live-count');
    
    errorContainer.style.display = 'none';
    gridContainer.innerHTML = '<div class="loading-cell">Loading active streams...</div>';

    try {
      const res = await fetch('/api/kick/livestreams');
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to fetch livestreams');
      }
      
      const responseData = await res.json();
      const streams = responseData.data || [];
      totalCountEl.textContent = streams.length;

      gridContainer.innerHTML = '';
      if (streams.length === 0) {
        gridContainer.innerHTML = '<div class="loading-cell">No active streams found. Make sure your client credentials are valid.</div>';
        return;
      }

      streams.forEach(stream => {
        const card = document.createElement('div');
        card.className = 'stream-card';
        card.innerHTML = `
          <div class="stream-thumbnail-wrapper">
            <img class="stream-thumbnail" src="${escapeHtml(stream.thumbnail)}" alt="Stream Thumbnail" onerror="this.src='https://kick.com/img/default-thumbnail-pictures/default2.jpeg'">
            <div class="viewer-badge">${escapeHtml(stream.viewer_count)} viewers</div>
          </div>
          <div class="stream-details">
            <div class="stream-title" title="${escapeHtml(stream.stream_title)}">${escapeHtml(stream.stream_title)}</div>
            <div class="streamer-info">
              <img class="streamer-avatar" src="${escapeHtml(stream.profile_picture)}" alt="Avatar" onerror="this.src='https://kick.com/img/default-profile-pictures/default2.jpeg'">
              <span class="streamer-name">${escapeHtml(stream.slug)}</span>
            </div>
            ${stream.category ? `<span class="stream-category">${escapeHtml(stream.category.name)}</span>` : ''}
            <button class="btn-primary watch-btn" style="margin-top: 12px; width: 100%; font-size: 11px; padding: 6px;" onclick="playStream('${escapeHtml(stream.slug)}')">📺 Watch Stream</button>
          </div>
        `;
        gridContainer.appendChild(card);
      });
    } catch (err) {
      errorContainer.textContent = `API Error: ${err.message}`;
      errorContainer.style.display = 'block';
      gridContainer.innerHTML = '<div class="loading-cell" style="color:var(--accent-red)">Failed to load active streams.</div>';
    }
  }

  // Refresh streams button listener
  const refreshStreamsBtn = document.getElementById('refresh-streams-btn');
  refreshStreamsBtn.addEventListener('click', () => {
    fetchStreams();
  });

  // Extract channel slug/username from any input link or string
  function extractSlug(input) {
    if (!input) return '';
    input = input.trim();
    // Remove protocol and host prefix
    let cleaned = input.replace(/^(https?:\/\/)?(www\.)?kick\.com\//i, '');
    // Split by trailing slash or query params
    cleaned = cleaned.split('/')[0].split('?')[0];
    return cleaned;
  }

  // Live Stream Player Panel references
  const playerPanel = document.getElementById('live-player-panel');
  const playerIframe = document.getElementById('kick-live-iframe');
  const playerTitle = document.getElementById('player-streamer-title');
  const closePlayerBtn = document.getElementById('close-player-btn');

  function playStream(slug) {
    if (!slug) return;
    playerTitle.textContent = `Watching Live Stream: ${slug}`;
    playerIframe.src = `https://player.kick.com/${slug}?autoplay=true&muted=false`;
    playerPanel.style.display = 'block';
    playerPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // Expose playStream globally so onclick attributes in cards can call it
  window.playStream = playStream;

  closePlayerBtn.addEventListener('click', () => {
    playerIframe.src = '';
    playerPanel.style.display = 'none';
  });

  // Lookup stream form submit handler
  const lookupForm = document.getElementById('channel-lookup-form');
  const lookupInput = document.getElementById('lookup-url-input');

  lookupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawVal = lookupInput.value;
    const slug = extractSlug(rawVal);
    if (!slug) {
      alert('Please enter a valid channel name or URL.');
      return;
    }

    const gridContainer = document.getElementById('streams-grid-container');
    const errorContainer = document.getElementById('streams-error-container');
    const totalCountEl = document.getElementById('total-live-count');

    errorContainer.style.display = 'none';
    gridContainer.innerHTML = `<div class="loading-cell">Searching for stream of "${escapeHtml(slug)}"...</div>`;
    playStream(slug);

    try {
      const res = await fetch(`/api/kick/channels/${encodeURIComponent(slug)}`);
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.error || 'Failed to retrieve channel data');
      }

      const result = await res.json();
      gridContainer.innerHTML = '';
      
      if (!result.isLive) {
        totalCountEl.textContent = '0';
        gridContainer.innerHTML = `
          <div class="stream-card" style="grid-column: 1 / -1; max-width: 450px; margin: 20px auto; padding: 20px; text-align: center;">
            <img class="streamer-avatar" src="${escapeHtml(result.channel.profile_picture || 'https://kick.com/img/default-profile-pictures/default2.jpeg')}" style="width: 80px; height: 80px; margin: 0 auto 15px auto;" onerror="this.src='https://kick.com/img/default-profile-pictures/default2.jpeg'">
            <h4 style="font-size: 18px; margin-bottom: 5px;">${escapeHtml(result.channel.slug || slug)}</h4>
            <p style="color: var(--text-muted); font-size: 13px; margin-bottom: 15px;">Channel exists but is currently offline.</p>
            <div style="margin-top: 10px; display: flex; flex-direction: column; gap: 10px;">
              <button class="btn-primary watch-btn" style="width: 100%; font-size: 11px; padding: 8px;" onclick="playStream('${escapeHtml(result.channel.slug || slug)}')">📺 Force Play Player (Bypass API)</button>
              <div style="background: rgba(255,255,255,0.05); padding: 10px; border-radius: 8px; font-size: 12px; color: var(--text-muted);">
                Followers: ${escapeHtml(result.channel.followers_count || 0)}
              </div>
            </div>
          </div>
        `;
        return;
      }

      totalCountEl.textContent = '1';
      const stream = result.livestream;
      const card = document.createElement('div');
      card.className = 'stream-card';
      card.style.gridColumn = '1 / -1';
      card.style.maxWidth = '450px';
      card.style.margin = '20px auto';
      
      card.innerHTML = `
        <div class="stream-thumbnail-wrapper">
          <img class="stream-thumbnail" src="${escapeHtml(stream.thumbnail)}" alt="Stream Thumbnail" onerror="this.src='https://kick.com/img/default-thumbnail-pictures/default2.jpeg'">
          <div class="viewer-badge">${escapeHtml(stream.viewer_count)} viewers</div>
        </div>
        <div class="stream-details">
          <div class="stream-title" title="${escapeHtml(stream.stream_title)}">${escapeHtml(stream.stream_title)}</div>
          <div class="streamer-info">
            <img class="streamer-avatar" src="${escapeHtml(stream.profile_picture)}" alt="Avatar" onerror="this.src='https://kick.com/img/default-profile-pictures/default2.jpeg'">
            <span class="streamer-name">${escapeHtml(stream.slug)}</span>
          </div>
          ${stream.category ? `<span class="stream-category">${escapeHtml(stream.category.name)}</span>` : ''}
          <div style="margin-top: 10px; font-size: 11px; color: var(--text-muted); margin-bottom: 10px;">
            Started: ${new Date(stream.started_at).toLocaleTimeString()}
          </div>
          <button class="btn-primary watch-btn" style="width: 100%; font-size: 11px; padding: 6px;" onclick="playStream('${escapeHtml(stream.slug)}')">📺 Watch Live Stream</button>
        </div>
      `;
      gridContainer.appendChild(card);
    } catch (err) {
      errorContainer.textContent = `API Error (Fallback Activated): ${err.message}`;
      errorContainer.style.display = 'block';
      
      gridContainer.innerHTML = `
        <div class="stream-card" style="grid-column: 1 / -1; max-width: 450px; margin: 20px auto; padding: 25px; text-align: center; border: 1px dashed var(--accent-red); background: rgba(220, 53, 69, 0.05);">
          <div style="font-size: 24px; margin-bottom: 10px;">📺</div>
          <h4 style="font-size: 16px; margin-bottom: 8px;">Unable to verify Stream status</h4>
          <p style="color: var(--text-muted); font-size: 12px; margin-bottom: 16px;">The server cannot access the Kick API (offline or blocked). However, you can still load the live player directly.</p>
          <button class="btn-primary watch-btn" style="width: 100%; max-width: 280px; margin: 0 auto; padding: 8px 12px;" onclick="playStream('${escapeHtml(slug)}')">⚡ Open Player For "${escapeHtml(slug)}"</button>
        </div>
      `;
    }
  });

  // Check Kick Auth Status
  async function checkKickAuth() {
    const connectBtn = document.getElementById('kick-connect-btn');
    const userInfo = document.getElementById('kick-user-info');
    const userAvatar = document.getElementById('kick-user-avatar');
    const userName = document.getElementById('kick-user-name');

    try {
      const res = await fetch('/api/kick/auth/me');
      const data = await res.json();

      if (data.loggedIn && data.user) {
        connectBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        userName.textContent = data.user.username;
        userAvatar.src = data.user.profilePicture;
      } else {
        connectBtn.style.display = 'inline-block';
        userInfo.style.display = 'none';
      }
    } catch (err) {
      console.error('Failed to check Kick connection state:', err);
    }
  }

  // Disconnect handler
  document.getElementById('kick-disconnect-btn').addEventListener('click', async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/kick/auth/logout', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        checkKickAuth();
      }
    } catch (err) {
      alert('Failed to disconnect Kick account: ' + err.message);
    }
  });

  // Kick Categories Functionality
  const categorySearchInput = document.getElementById('category-search-input');
  const viewTopCategoriesBtn = document.getElementById('view-top-categories-btn');
  const categoriesGrid = document.getElementById('categories-grid-container');

  async function renderCategories(categories) {
    categoriesGrid.innerHTML = '';
    if (!categories || categories.length === 0) {
      categoriesGrid.innerHTML = '<div class="loading-cell">No categories found matching your query.</div>';
      return;
    }

    categories.forEach(category => {
      const card = document.createElement('div');
      card.className = 'stream-card';
      card.style.cursor = 'pointer';
      
      const thumbnail = category.thumbnail || 'https://kick.com/img/categories/default.jpeg';
      const viewerCount = category.viewer_count !== undefined ? category.viewer_count : 0;
      const tagsHtml = category.tags && category.tags.length > 0 
        ? `<div style="display:flex; flex-wrap:wrap; gap:4px; margin-top:8px;">
            ${category.tags.map(t => `<span style="font-size:10px; background:rgba(255,255,255,0.05); padding:2px 6px; border-radius:4px;">${escapeHtml(t)}</span>`).join('')}
           </div>`
        : '';

      card.innerHTML = `
        <div class="stream-thumbnail-wrapper" style="aspect-ratio:3/4; overflow:hidden;">
          <img class="stream-thumbnail" src="${escapeHtml(thumbnail)}" alt="${escapeHtml(category.name)}" onerror="this.src='https://kick.com/img/categories/default.jpeg'" style="object-fit:cover; height:100%;">
          ${viewerCount > 0 ? `<div class="viewer-badge">${viewerCount.toLocaleString()} Live</div>` : ''}
        </div>
        <div class="stream-details">
          <div class="stream-title" style="font-weight:600; font-size:14px; margin-bottom:4px;">${escapeHtml(category.name)}</div>
          ${tagsHtml}
        </div>
      `;

      card.addEventListener('click', async () => {
        // Fetch fresh metadata for this specific category to show live count / details
        try {
          const detailRes = await fetch(`/api/kick/categories/${category.id}`);
          const detailData = await detailRes.json();
          const fresh = detailData.data || category;
          alert(`Category: ${fresh.name}\nLive Viewers: ${(fresh.viewer_count || 0).toLocaleString()}\nTags: ${(fresh.tags || []).join(', ') || 'None'}`);
        } catch (e) {
          alert(`Category: ${category.name}`);
        }
      });

      categoriesGrid.appendChild(card);
    });
  }

  async function fetchTopCategories() {
    categoriesGrid.innerHTML = '<div class="loading-cell">Fetching popular categories...</div>';
    try {
      const res = await fetch('/api/kick/categories');
      const data = await res.json();
      renderCategories(data.data || []);
    } catch (err) {
      categoriesGrid.innerHTML = `<div class="loading-cell" style="color:var(--accent-red)">Error: ${escapeHtml(err.message)}</div>`;
    }
  }

  // De-bounce search queries
  let searchTimeout = null;
  categorySearchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value.trim();
    if (!query) {
      categoriesGrid.innerHTML = '<div class="loading-cell">Enter a search query or click "Top Categories" to view.</div>';
      return;
    }

    searchTimeout = setTimeout(async () => {
      categoriesGrid.innerHTML = '<div class="loading-cell">Searching...</div>';
      try {
        const res = await fetch(`/api/kick/categories/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        renderCategories(data.data || []);
      } catch (err) {
        categoriesGrid.innerHTML = `<div class="loading-cell" style="color:var(--accent-red)">Error: ${escapeHtml(err.message)}</div>`;
      }
    }, 400);
  });

  viewTopCategoriesBtn.addEventListener('click', fetchTopCategories);

  // Automate Account Creation Form Handlers
  const automateForm = document.getElementById('automate-accounts-form');
  const automateBtn = document.getElementById('automate-btn');
  const stopAutomateBtn = document.getElementById('stop-automate-btn');
  const emailProvider = document.getElementById('email-provider');
  const kopechkaKeyGroup = document.getElementById('kopechka-key-group');
  const automateStatus = document.getElementById('automate-status');
  const automateProgress = document.getElementById('automate-progress');
  const automateStatusText = document.getElementById('automate-status-text');
  const automatePercentText = document.getElementById('automate-percent-text');
  const dinoConsole = document.getElementById('dino-console');

  if (emailProvider && kopechkaKeyGroup) {
    emailProvider.addEventListener('change', (e) => {
      if (e.target.value === 'kopeechka') {
        kopechkaKeyGroup.style.display = 'block';
      } else {
        kopechkaKeyGroup.style.display = 'none';
      }
    });
  }

  let dinoPollInterval = null;

  async function pollDinoStatus() {
    try {
      const res = await fetch('/api/kickerz/accounts/status');
      if (!res.ok) return;
      const data = await res.json();

      // Render dino console logs
      if (dinoConsole && data.logs) {
        dinoConsole.innerHTML = '';
        data.logs.forEach(line => {
          const div = document.createElement('div');
          div.textContent = line;
          
          if (line.includes('Success') || line.includes('✔️') || line.includes('✅')) {
            div.style.color = '#53fc18';
          } else if (line.includes('CRITICAL') || line.includes('Failed') || line.includes('❌') || line.includes('error')) {
            div.style.color = '#ff4a4a';
          } else {
            div.style.color = '#ffffff';
          }
          
          dinoConsole.appendChild(div);
        });
        dinoConsole.scrollTop = dinoConsole.scrollHeight;
      }

      // Update progress bar
      if (data.totalCount > 0) {
        const percentage = Math.round((data.currentIndex / data.totalCount) * 100);
        automateProgress.style.width = `${percentage}%`;
        automatePercentText.textContent = `${percentage}%`;
        automateStatusText.textContent = `Processing account ${data.currentIndex} of ${data.totalCount}... (${data.successes.length} created)`;
      }

      if (data.active) {
        automateStatus.style.display = 'block';
        automateBtn.style.display = 'none';
        if (stopAutomateBtn) stopAutomateBtn.style.display = 'inline-block';
        
        if (!dinoPollInterval) {
          dinoPollInterval = setInterval(pollDinoStatus, 1500);
        }
      } else {
        automateBtn.style.display = 'inline-block';
        if (stopAutomateBtn) stopAutomateBtn.style.display = 'none';
        
        if (data.totalCount > 0) {
          automateStatusText.textContent = `Completed batch registration! Successfully registered ${data.successes.length} of ${data.totalCount} accounts.`;
          automateProgress.style.width = '100%';
          automatePercentText.textContent = '100%';
        }
        
        if (dinoPollInterval) {
          clearInterval(dinoPollInterval);
          dinoPollInterval = null;
          // Refresh dashboard data
          fetchUsers();
          fetchMetrics();
        }
      }
    } catch (err) {
      console.error('Failed to poll account creator status:', err);
    }
  }

  if (automateForm) {
    automateForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const countInput = document.getElementById('automate-count');
      const keyInput = document.getElementById('kopechka-key');
      const useProxyInput = document.getElementById('use-proxy');
      
      const count = parseInt(countInput.value) || 5;
      const provider = emailProvider ? emailProvider.value : 'mailtm';
      const kopechkaKey = keyInput ? keyInput.value.trim() : '';
      const useProxy = useProxyInput ? useProxyInput.checked : true;

      if (provider === 'kopeechka' && !kopechkaKey) {
        alert('Please enter a Kopeechka token to proceed with paid account creation.');
        return;
      }

      try {
        automateBtn.disabled = true;
        automateBtn.textContent = 'Initializing...';
        
        const res = await fetch('/api/kickerz/accounts/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count, provider, kopechkaKey, useProxy })
        });
        if (!res.ok) {
          const text = await res.text();
          let errData;
          try {
            errData = JSON.parse(text);
          } catch(e) {}
          throw new Error(errData?.error || `Server returned error status ${res.status}`);
        }
        
        const data = await res.json();
        automateBtn.disabled = false;
        automateBtn.textContent = '⚡ Create Real Accounts';
        
        // Start polling
        automateStatus.style.display = 'block';
        if (dinoPollInterval) clearInterval(dinoPollInterval);
        pollDinoStatus();
        dinoPollInterval = setInterval(pollDinoStatus, 1500);

      } catch (err) {
        automateBtn.disabled = false;
        automateBtn.textContent = '⚡ Create Real Accounts';
        alert('Failed to start creator: ' + err.message);
      }
    });
  }

  if (stopAutomateBtn) {
    stopAutomateBtn.addEventListener('click', async () => {
      try {
        stopAutomateBtn.disabled = true;
        stopAutomateBtn.textContent = 'Stopping...';
        
        const res = await fetch('/api/kickerz/accounts/stop', { method: 'POST' });
        const data = await res.json();
        
        stopAutomateBtn.disabled = false;
        stopAutomateBtn.textContent = '⏹ Stop Creator';
        
        if (dinoPollInterval) {
          clearInterval(dinoPollInterval);
          dinoPollInterval = null;
        }
        pollDinoStatus();
      } catch (err) {
        stopAutomateBtn.disabled = false;
        stopAutomateBtn.textContent = '⏹ Stop Creator';
        alert('Error stopping creator: ' + err.message);
      }
    });
  }

  let metricsInterval = null;
  function loadDashboardData() {
    pollDinoStatus();
    pollLogs();
    fetchUsers();
    fetchMetrics();
    checkKickAuth();
    
    if (metricsInterval) clearInterval(metricsInterval);
    metricsInterval = setInterval(fetchMetrics, 15000);

    const savedSmmKey = localStorage.getItem('smm_api_key');
    if (savedSmmKey) {
      const smmApiKeyInput = document.getElementById('smm-api-key-input');
      if (smmApiKeyInput) {
        smmApiKeyInput.value = savedSmmKey;
        initSmmPanel();
      }
    }
  }

  // ========================== SMM Panel (Premium Viewers) ==========================
  
  let smmServices = [];
  let smmOrderPollInterval = null;

  // API Key management (stored in localStorage for persistence)
  const smmSaveKeyBtn = document.getElementById('smm-save-key-btn');
  const smmApiKeyInput = document.getElementById('smm-api-key-input');
  const smmKeySetup = document.getElementById('smm-key-setup');
  const smmOrderForm = document.getElementById('smm-order-form');

  if (smmSaveKeyBtn) {
    smmSaveKeyBtn.addEventListener('click', async () => {
      const key = smmApiKeyInput.value.trim();
      if (!key) { alert('Please enter an API key'); return; }
      
      smmSaveKeyBtn.disabled = true;
      smmSaveKeyBtn.textContent = 'Connecting...';
      
      try {
        // Save key to server env and localStorage
        const res = await fetch('/api/kickerz/smm/set-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: key })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);
        
        localStorage.setItem('smm_api_key', key);
        initSmmPanel();
      } catch (err) {
        alert('Connection failed: ' + err.message);
      } finally {
        smmSaveKeyBtn.disabled = false;
        smmSaveKeyBtn.textContent = 'Save & Connect';
      }
    });
  }

  async function initSmmPanel() {
    // Show connected state
    smmKeySetup.innerHTML = `
      <div class="connected-indicator">
        <span style="font-size: 16px;">✅</span>
        <span>Connected to Top4SMM</span>
        <button id="smm-disconnect-btn" style="margin-left: auto; background: none; border: 1px solid rgba(239,68,68,0.3); color: #ef4444; padding: 3px 10px; border-radius: 6px; font-size: 11px; cursor: pointer;">Disconnect</button>
      </div>
    `;
    
    document.getElementById('smm-disconnect-btn').addEventListener('click', () => {
      localStorage.removeItem('smm_api_key');
      location.reload();
    });

    smmOrderForm.style.display = 'block';

    // Fetch balance and services
    fetchSmmBalance();
    fetchSmmServices();
    fetchSmmOrders();

    // Start polling orders every 15s
    if (smmOrderPollInterval) clearInterval(smmOrderPollInterval);
    smmOrderPollInterval = setInterval(fetchSmmOrders, 15000);
  }

  async function fetchSmmBalance() {
    try {
      const res = await fetch('/api/kickerz/smm/balance');
      const data = await res.json();
      const balanceEl = document.getElementById('smm-balance-value');
      if (data.balance !== undefined) {
        balanceEl.textContent = '$' + parseFloat(data.balance).toFixed(2);
      } else {
        balanceEl.textContent = 'Error';
        balanceEl.style.color = '#ef4444';
      }
    } catch (err) {
      document.getElementById('smm-balance-value').textContent = 'N/A';
    }
  }

  async function fetchSmmServices() {
    const select = document.getElementById('smm-service-select');
    try {
      const res = await fetch('/api/kickerz/smm/services');
      const data = await res.json();
      
      if (data.error) {
        select.innerHTML = '<option value="">Error loading services</option>';
        return;
      }

      smmServices = data;
      select.innerHTML = '<option value="">— Select a viewer package —</option>';
      
      data.forEach(svc => {
        const opt = document.createElement('option');
        opt.value = svc.service;
        opt.textContent = `${svc.name} — $${svc.rate}/1K (Min: ${svc.min}, Max: ${svc.max})`;
        opt.dataset.rate = svc.rate;
        opt.dataset.min = svc.min;
        opt.dataset.max = svc.max;
        select.appendChild(opt);
      });
    } catch (err) {
      select.innerHTML = '<option value="">Failed to load services</option>';
    }
  }

  // Price estimation
  const smmServiceSelect = document.getElementById('smm-service-select');
  const smmQuantityInput = document.getElementById('smm-quantity');

  function updatePriceEstimate() {
    const priceBox = document.getElementById('smm-price-estimate');
    const selected = smmServiceSelect.options[smmServiceSelect.selectedIndex];
    
    if (!selected || !selected.value) {
      priceBox.style.display = 'none';
      return;
    }

    const rate = parseFloat(selected.dataset.rate);
    const min = parseInt(selected.dataset.min);
    const max = parseInt(selected.dataset.max);
    const qty = parseInt(smmQuantityInput.value) || 0;
    const cost = (rate / 1000) * qty;

    document.getElementById('smm-price-value').textContent = '$' + cost.toFixed(2);
    document.getElementById('smm-rate-display').textContent = '$' + rate.toFixed(2);
    document.getElementById('smm-min-display').textContent = min.toLocaleString();
    document.getElementById('smm-max-display').textContent = max.toLocaleString();
    priceBox.style.display = 'block';

    // Validate quantity
    if (qty < min || qty > max) {
      smmQuantityInput.style.borderColor = '#ef4444';
    } else {
      smmQuantityInput.style.borderColor = '';
    }
  }

  if (smmServiceSelect) smmServiceSelect.addEventListener('change', updatePriceEstimate);
  if (smmQuantityInput) smmQuantityInput.addEventListener('input', updatePriceEstimate);

  // Place order
  if (smmOrderForm) {
    smmOrderForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const serviceId = smmServiceSelect.value;
      const link = document.getElementById('smm-channel-link').value.trim();
      const quantity = parseInt(smmQuantityInput.value);

      if (!serviceId) { alert('Please select a viewer package'); return; }
      if (!link) { alert('Please enter a channel link'); return; }
      if (!quantity || quantity < 1) { alert('Please enter a valid quantity'); return; }

      const orderBtn = document.getElementById('smm-order-btn');
      orderBtn.disabled = true;
      orderBtn.textContent = 'Placing Order...';

      try {
        const res = await fetch('/api/kickerz/smm/order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ serviceId: parseInt(serviceId), link, quantity })
        });
        const data = await res.json();

        if (data.error) throw new Error(data.error);

        orderBtn.textContent = '✅ Order Placed!';
        orderBtn.style.background = 'rgba(83, 252, 24, 0.15)';
        setTimeout(() => {
          orderBtn.textContent = '🚀 Place Viewer Order';
          orderBtn.style.background = '';
          orderBtn.disabled = false;
        }, 2000);

        // Refresh balance and orders
        fetchSmmBalance();
        fetchSmmOrders();
      } catch (err) {
        alert('Order failed: ' + err.message);
        orderBtn.disabled = false;
        orderBtn.textContent = '🚀 Place Viewer Order';
      }
    });
  }

  // Fetch and render orders
  async function fetchSmmOrders() {
    try {
      const res = await fetch('/api/kickerz/smm/orders');
      const orders = await res.json();
      renderSmmOrders(orders);
    } catch (err) {
      // Silently fail on poll
    }
  }

  function getStatusClass(status) {
    if (!status) return 'pending';
    const s = status.toLowerCase();
    if (s === 'completed') return 'completed';
    if (s === 'in progress') return 'in-progress';
    if (s === 'processing') return 'processing';
    if (s === 'pending') return 'pending';
    if (s === 'partial') return 'partial';
    if (s === 'cancelled' || s === 'canceled') return 'cancelled';
    return 'pending';
  }

  function renderSmmOrders(orders) {
    const container = document.getElementById('smm-orders-list');
    if (!orders || orders.length === 0) {
      container.innerHTML = '<div class="smm-empty-state">No orders yet. Place your first order above.</div>';
      return;
    }

    container.innerHTML = orders.map(order => {
      const statusClass = getStatusClass(order.status);
      const canCancel = !order.status || order.status.toLowerCase() === 'pending';
      const timeAgo = order.placedAt ? new Date(order.placedAt).toLocaleTimeString() : '—';
      
      return `
        <div class="smm-order-card">
          <div class="order-header">
            <span class="order-channel">${escapeHtml(order.channel || order.link || '—')}</span>
            <span class="smm-status-badge ${statusClass}">${order.status || 'Pending'}</span>
          </div>
          <div class="order-details">
            <span>🎫 #${order.orderId}</span>
            <span>👁 ${order.quantity} viewers</span>
            <span>💰 $${parseFloat(order.cost || 0).toFixed(2)}</span>
            <span>🕐 ${timeAgo}</span>
          </div>
          ${canCancel ? `<div style="margin-top: 8px; text-align: right;">
            <button class="smm-cancel-btn" onclick="cancelSmmOrder(${order.orderId})">Cancel</button>
          </div>` : ''}
        </div>
      `;
    }).join('');
  }

  // Cancel order (global scope for onclick)
  window.cancelSmmOrder = async function(orderId) {
    if (!confirm('Cancel order #' + orderId + '?')) return;
    try {
      const res = await fetch(`/api/kickerz/smm/cancel/${orderId}`, { method: 'POST' });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      fetchSmmOrders();
      fetchSmmBalance();
    } catch (err) {
      alert('Cancel failed: ' + err.message);
    }
  };

  // Refresh orders button
  const refreshOrdersBtn = document.getElementById('smm-refresh-orders-btn');
  if (refreshOrdersBtn) {
    refreshOrdersBtn.addEventListener('click', () => {
      fetchSmmOrders();
      fetchSmmBalance();
    });
  }
});
