import sys
import time
import random
import datetime
import asyncio
import websockets
import json
import os
import ssl
import socket
import urllib.parse
import argparse
import certifi
from threading import Thread
from concurrent.futures import ThreadPoolExecutor
import tls_client
import threading

# Create a proper SSL context using certifi (macOS Python 3.14 doesn't have system certs)
ssl_context = ssl.create_default_context(cafile=certifi.where())

CLIENT_TOKEN = "e1393935a959b4020a4491574f6490129f678acdaa92760471263db43487f823"

# Global state
stats_lock = threading.Lock()
channel = ""
channel_id = None
stream_id = None
stop = False
start_time = None
connections = 0
target_connections = 0
attempts = 0
pings = 0
heartbeats = 0
viewers = 0
last_check = 0
num_stable_workers = 0
num_churn_workers = 0
token_fails = 0
proxies = []

executor = ThreadPoolExecutor(max_workers=750)

def clean_channel_name(name):
    if "kick.com/" in name:
        parts = name.split("kick.com/")
        return parts[1].split("/")[0].split("?")[0].lower()
    return name.lower()

def get_channel_info(name, proxy=None):
    global channel_id, stream_id
    try:
        s = tls_client.Session(client_identifier="chrome_131", random_tls_extension_order=True)
        s.headers.update({
            'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Referer': 'https://kick.com/',
            'Origin': 'https://kick.com',
        })
        if proxy:
            s.proxies = {"http": proxy, "https": proxy}
        response = s.get(f'https://kick.com/api/v2/channels/{name}', timeout_seconds=15)
        if response.status_code == 200:
            data = response.json()
            channel_id = data.get("id")
            if 'livestream' in data and data['livestream']:
                stream_id = data['livestream'].get('id')
            return True
        return None
    except Exception as e:
        return None

def get_token(proxy=None):
    """Fetch a WebSocket viewer token.
    
    Strategy: Try DIRECT connection first (Cloudflare blocks most proxy IPs).
    The token is IP-agnostic — we can fetch it directly and still use the
    proxy for the actual WebSocket connection.
    """
    global token_fails
    
    # Try direct first (most reliable), then via proxy as fallback
    attempts_order = [None]  # Direct first
    if proxy:
        attempts_order.append(proxy)  # Then try via proxy
    
    for attempt_proxy in attempts_order:
        try:
            s = tls_client.Session(client_identifier="chrome_131", random_tls_extension_order=True)
            if attempt_proxy:
                s.proxies = {"http": attempt_proxy, "https": attempt_proxy}
            
            # Step 1: Visit kick.com to get Cloudflare cookies
            s.get("https://kick.com/", headers={
                'Accept-Language': 'en-US,en;q=0.9',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            }, timeout_seconds=10)
            
            # Step 2: Fetch token WITH cookies
            token_headers = {
                'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9',
                'X-Client-Token': CLIENT_TOKEN, 'Referer': 'https://kick.com/', 'Origin': 'https://kick.com',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            }
            response = s.get('https://websockets.kick.com/viewer/v1/token', headers=token_headers, timeout_seconds=10)
            if response.status_code == 200:
                token = response.json().get("data", {}).get("token")
                if token: 
                    return token
        except Exception:
            continue
    
    with stats_lock:
        token_fails += 1
    return None

def get_viewer_count(proxy=None):
    global viewers, last_check
    if not stream_id: 
        return
    
    # Try direct first, then proxy
    attempts_order = [None]
    if proxy:
        attempts_order.append(proxy)
    
    for attempt_proxy in attempts_order:
        try:
            s = tls_client.Session(client_identifier="chrome_131", random_tls_extension_order=True)
            if attempt_proxy:
                s.proxies = {"http": attempt_proxy, "https": attempt_proxy}
            s.headers.update({
                'Accept': 'application/json, text/plain, */*',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            })
            url = f"https://kick.com/current-viewers?ids[]={stream_id}"
            response = s.get(url, timeout_seconds=10)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, list) and len(data) > 0:
                    with stats_lock:
                        viewers = data[0].get('viewers', 0)
                        last_check = time.time()
                    return  # Success
        except:
            continue

async def websocket_lifecycle(token, proxy=None):
    global connections, heartbeats, pings
    connected = False
    secure_sock = None
    
    url = f"wss://websockets.kick.com/viewer/v1/connect?token={token}"
    
    # Try proxy first, then fall back to direct
    proxy_succeeded = False
    
    if proxy:
        try:
            parsed = urllib.parse.urlparse(proxy)
            proxy_host = parsed.hostname
            proxy_port = parsed.port or 80
            
            # Create TCP connection through HTTP CONNECT
            reader, writer = await asyncio.open_connection(proxy_host, proxy_port)
            connect_req = f"CONNECT websockets.kick.com:443 HTTP/1.1\r\nHost: websockets.kick.com:443\r\n"
            if parsed.username and parsed.password:
                auth = f"{parsed.username}:{parsed.password}"
                import base64
                auth_b64 = base64.b64encode(auth.encode()).decode()
                connect_req += f"Proxy-Authorization: Basic {auth_b64}\r\n"
            connect_req += "\r\n"
            
            writer.write(connect_req.encode())
            await writer.drain()
            
            # Read CONNECT response headers
            response = b""
            while b"\r\n\r\n" not in response:
                chunk = await asyncio.wait_for(reader.read(4096), timeout=10)
                if not chunk:
                    break
                response += chunk
                
            if b" 200 " in response.split(b"\r\n")[0]:
                # Wrap socket in SSL using certifi CA bundle
                raw_socket = writer.get_extra_info('socket')
                if raw_socket is not None:
                    async with websockets.connect(url, sock=raw_socket, ssl=ssl_context, server_hostname="websockets.kick.com", open_timeout=10, close_timeout=5) as ws:
                        with stats_lock:
                            connections += 1
                            heartbeats += 1
                        connected = True
                        proxy_succeeded = True
                        await ws.send(json.dumps({"type": "channel_handshake", "data": {"message": {"channelId": channel_id}}}))
                        while not stop:
                            await ws.send(json.dumps({"type": "ping"}))
                            with stats_lock:
                                pings += 1
                            await asyncio.sleep(12 + random.uniform(1, 5))
            
            if not proxy_succeeded:
                try:
                    writer.close()
                    await writer.wait_closed()
                except:
                    pass
        except Exception:
            pass
    
    # Fallback to direct connection if proxy failed or not provided
    if not proxy_succeeded and not connected:
        try:
            async with websockets.connect(url, ssl=ssl_context, open_timeout=10, close_timeout=5) as ws:
                with stats_lock:
                    connections += 1
                    heartbeats += 1
                connected = True
                await ws.send(json.dumps({"type": "channel_handshake", "data": {"message": {"channelId": channel_id}}}))
                while not stop:
                    await ws.send(json.dumps({"type": "ping"}))
                    with stats_lock:
                        pings += 1
                    await asyncio.sleep(12 + random.uniform(1, 5))
        except Exception:
            pass
    
    if connected:
        with stats_lock:
            connections -= 1
    if secure_sock:
        try:
            secure_sock.close()
        except:
            pass

async def worker(proxy=None, worker_type="stable"):
    global attempts
    loop = asyncio.get_running_loop()
    retry_delay = 5
    while not stop:
        with stats_lock:
            attempts += 1
        token = await loop.run_in_executor(executor, get_token, proxy)
        if token:
            retry_delay = 5
            if worker_type == "stable":
                await websocket_lifecycle(token, proxy)
                await asyncio.sleep(random.uniform(1, 3))
            elif worker_type == "churn":
                try:
                    await asyncio.wait_for(websocket_lifecycle(token, proxy), timeout=random.uniform(45, 300))
                except asyncio.TimeoutError:
                    pass
                await asyncio.sleep(random.uniform(10, 60))
        else:
            await asyncio.sleep(retry_delay)
            retry_delay = min(retry_delay * 2, 60)

async def supervisor(worker_type, proxy=None):
    while not stop:
        try:
            await worker(proxy, worker_type)
        except asyncio.CancelledError:
            break
        except Exception as e:
            await asyncio.sleep(5)

# Periodic status printer thread (JSON formatting to stdout)
def status_printer_thread():
    global last_check
    while not stop:
        try:
            if time.time() - last_check >= 5:
                # Use a random proxy if available to update viewer count
                proxy = random.choice(proxies) if proxies else None
                get_viewer_count(proxy)
                
            with stats_lock:
                stats = {
                    "connections": connections,
                    "target_connections": target_connections,
                    "attempts": attempts,
                    "pings": pings,
                    "heartbeats": heartbeats,
                    "token_fails": token_fails,
                    "viewers": viewers
                }
            print(json.dumps(stats))
            sys.stdout.flush()
        except Exception as e:
            pass
        time.sleep(2)

async def main_async(total_connections, stable_percentage):
    global num_stable_workers, num_churn_workers
    num_stable_workers = int(total_connections * (stable_percentage / 100))
    num_churn_workers = total_connections - num_stable_workers
    
    tasks = []
    for i in range(num_stable_workers):
        proxy = proxies[i % len(proxies)] if proxies else None
        tasks.append(asyncio.create_task(supervisor("stable", proxy)))
        
    for i in range(num_churn_workers):
        proxy = proxies[(num_stable_workers + i) % len(proxies)] if proxies else None
        tasks.append(asyncio.create_task(supervisor("churn", proxy)))
        
    await asyncio.gather(*tasks, return_exceptions=False)

def run():
    global channel, start_time, channel_id, stream_id, stop, target_connections, proxies
    
    parser = argparse.ArgumentParser(description="Kickerz WebSocket Live Viewbot")
    parser.add_argument("--channel", type=str, required=True, help="Target channel name or URL")
    parser.add_argument("--threads", type=int, default=10, help="Target connection count")
    parser.add_argument("--stable-percentage", type=int, default=70, help="Percentage of stable viewer connections")
    parser.add_argument("--proxies-file", type=str, default=None, help="Path to proxy list text file")
    
    args = parser.parse_args()
    
    channel = clean_channel_name(args.channel)
    start_time = datetime.datetime.now()
    target_connections = args.threads
    
    # Load proxies if supplied
    if args.proxies_file and os.path.exists(args.proxies_file):
        with open(args.proxies_file, 'r') as f:
            for line in f:
                p = line.strip()
                if p:
                    # Parse and normalize proxy syntax
                    if not p.startswith('http://') and not p.startswith('https://'):
                        p = 'http://' + p
                    proxies.append(p)
                    
    # Initialize channel metadata
    # Try DIRECT connection first (no proxy) — most reliable for metadata
    log_msg = {"status": "init", "message": f"Fetching channel info for '{channel}' (direct)..."}
    print(json.dumps(log_msg)); sys.stdout.flush()
    
    init_success = get_channel_info(channel, proxy=None)
    
    # If direct fails, try with proxies as fallback
    if not init_success or not stream_id:
        if proxies:
            log_msg = {"status": "init", "message": "Direct fetch failed, trying via proxy..."}
            print(json.dumps(log_msg)); sys.stdout.flush()
            for i, p in enumerate(proxies[:5]):  # Try up to 5 proxies
                init_success = get_channel_info(channel, proxy=p)
                if init_success and stream_id:
                    log_msg = {"status": "init", "message": f"Channel info fetched via proxy #{i+1}"}
                    print(json.dumps(log_msg)); sys.stdout.flush()
                    break
    
    if not init_success or not stream_id:
        err_msg = {"error": f"Could not fetch channel metadata or stream ID for '{channel}'. The stream may be offline or Kick API is unreachable."}
        print(json.dumps(err_msg))
        sys.exit(1)
    
    log_msg = {"status": "init", "message": f"Channel '{channel}' is LIVE! Channel ID: {channel_id}, Stream ID: {stream_id}"}
    print(json.dumps(log_msg)); sys.stdout.flush()
        
    # Start background status logging thread
    stats_log = Thread(target=status_printer_thread, daemon=True)
    stats_log.start()
    
    try:
        asyncio.run(main_async(args.threads, args.stable_percentage))
    except (KeyboardInterrupt, asyncio.CancelledError):
        pass
    finally:
        stop = True

if __name__ == "__main__":
    run()
