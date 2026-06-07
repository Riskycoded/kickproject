import sys
import os
import time
import names
import random
import secrets
import string
import re
import json
import argparse
import urllib.request
import urllib.parse
from datetime import datetime
from botasaurus.browser import *
from mailtm import Email

# ============================================================
# MONKEY-PATCH: Fix botasaurus Chrome 148 startup timeout
# Chrome 148+ takes ~9s to open DevTools port on macOS.
# The original ensure_chrome_is_alive only catches URLError/HTTPError,
# missing TimeoutError/OSError/ConnectionRefusedError. We also
# increase the total wait duration from 15s to 30s.
# ============================================================
import botasaurus_driver.core.browser as _bota_browser
from urllib.error import URLError, HTTPError

def _patched_ensure_chrome_is_alive(url):
    start_time = time.time()
    timeout = 5
    duration = 30  # Chrome 148 needs ~9s to start
    retry_delay = 0.5
    while time.time() - start_time < duration:
        try:
            req = urllib.request.Request(url)
            with urllib.request.urlopen(req, timeout=timeout) as response:
                if response.status == 200:
                    data = response.read().decode('utf-8')
                    parsed_data = json.loads(data)
                    if isinstance(parsed_data, list):
                        return parsed_data
        except (URLError, HTTPError, TimeoutError, OSError, ConnectionRefusedError):
            time.sleep(retry_delay)
            continue
    raise Exception(f"Failed to connect to Chrome URL: {url}.")

_bota_browser.ensure_chrome_is_alive = _patched_ensure_chrome_is_alive
# ============================================================

def send_log(status, step, message, **kwargs):
    log_data = {"status": status, "step": step, "message": message}
    log_data.update(kwargs)
    print(json.dumps(log_data))
    sys.stdout.flush()

def generate_realistic_username():
    name1, name2 = names.get_first_name().lower(), names.get_first_name().lower()
    while name1 == name2: 
        name2 = names.get_first_name().lower()
    return f"{name1}{name2}{random.randint(100, 9999)}"

def generate_complex_password(min_length=8, max_length=20):
    alphabet = string.ascii_letters + string.digits + string.punctuation
    while True:
        password = ''.join(secrets.choice(alphabet) for _ in range(random.randint(min_length, max_length)))
        if (any(c.islower() for c in password) and any(c.isupper() for c in password) and
            any(c.isdigit() for c in password) and any(c in string.punctuation for c in password)):
            return password

def human_type(driver: Driver, selector: str, text: str):
    for char in text:
        driver.type(selector, char)
        time.sleep(random.uniform(0.04, 0.11))

# Kopeechka Helpers
def kopeechka_get_email(api_url, api_key):
    # Standardize url format (remove trailing slash)
    api_url = api_url.rstrip('/')
    if "mock/kopechka" in api_url or "localhost" in api_url:
        req = urllib.request.Request(
            f"{api_url}/orders",
            data=json.dumps({"site": "kick.com", "domain": "asia.com"}).encode('utf-8'),
            headers={"X-API-Key": api_key, "Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=10) as res:
            data = json.loads(res.read().decode())
            return data['data']['email'], data['data']['id']
    else:
        # Real Kopeechka API
        url = f"{api_url}/mailbox-get-email?site=kick.com&mail_type=outlook&token={api_key}&api=2.0"
        with urllib.request.urlopen(url, timeout=10) as res:
            data = json.loads(res.read().decode())
            if data.get('value') == 'success' or 'mail' in data:
                return data['mail'], data['id']
            else:
                raise Exception(f"Kopeechka error ordering email: {data.get('value')}")

def kopeechka_get_code(api_url, api_key, order_id):
    api_url = api_url.rstrip('/')
    for _ in range(25):
        try:
            if "mock/kopechka" in api_url or "localhost" in api_url:
                req = urllib.request.Request(
                    f"{api_url}/orders/{order_id}/messages",
                    headers={"X-API-Key": api_key}
                )
                with urllib.request.urlopen(req, timeout=10) as res:
                    data = json.loads(res.read().decode())
                    if data.get('success') and data.get('data'):
                        text = data['data'][0]['text']
                        match = re.search(r'\b(\d{6})\b', text)
                        if match:
                            return match.group(1)
            else:
                url = f"{api_url}/mailbox-get-message?id={order_id}&token={api_key}&api=2.0"
                with urllib.request.urlopen(url, timeout=10) as res:
                    data = json.loads(res.read().decode())
                    if data.get('value') == 'success' or data.get('full_message'):
                        text = data.get('full_message', '') or data.get('value', '')
                        match = re.search(r'\b(\d{6})\b', text)
                        if match:
                            return match.group(1)
                        if len(str(data.get('value'))) == 6:
                            return str(data.get('value'))
                    elif data.get('value') == 'WAIT_LINK':
                        pass
        except Exception as e:
            pass
        time.sleep(3)
    raise Exception("Timed out waiting for email code from Kopeechka")

def create_browser_task(proxy_url=None):
    """Factory that creates a botasaurus browser task with optional proxy."""
    @browser(output=None, headless=True, window_size=(1920, 1080), proxy=proxy_url)
    def register_on_kick_task(driver: Driver, data: dict):
        username = data['username']
        password = data['password']
        email = data['email']
        provider = data['provider']
        api_url = data['api_url']
        api_key = data['api_key']
        order_id = data.get('order_id')
        email_client = data.get('email_client')
        shared_data = data['shared_data']

        send_log("running", "navigating", "Applying stealth enhancements and navigating to Kick...")
        driver.enable_human_mode()
        try:
            driver.google_get("https://www.kick.com/", bypass_cloudflare=True)
            driver.run_js("Object.defineProperty(navigator, 'webdriver', { get: () => undefined });")
            if driver.is_element_present('[data-testid="accept-cookies"]', wait=5):
                driver.click('[data-testid="accept-cookies"]')
                send_log("running", "cookies", "Accepted cookie consent banner.")
            else:
                send_log("running", "cookies", "No cookie consent banner found, continuing.")
        except Exception as e:
            send_log("error", "navigation_failed", f"CRITICAL: Failed during initial navigation: {str(e)}")
            driver.save_screenshot("error_navigation.png")
            return False

        try:
            send_log("running", "form_filling", f"Attempting to register account: {username}")
            driver.click_element_containing_text("Sign Up")
            driver.short_random_sleep()
            human_type(driver, "input[name='email']", email)
            driver.type("input[name='birthdate']", "10-10-2000")
            human_type(driver, "input[name='username']", username)
            human_type(driver, "input[name='password']", password)
            driver.click('[data-testid="sign-up-submit"]')
            send_log("running", "form_submitted", "Registration form details typed and submitted.")
        except Exception as e:
            send_log("error", "form_fill_failed", f"CRITICAL: Failed to type or submit form: {str(e)}")
            driver.save_screenshot("error_form_fill.png")
            return False

        # Retrieve verification code
        try:
            send_log("running", "waiting_code", "Waiting for the 6-digit verification code...")
            driver.get_element_containing_text("Please enter the 6-digit security code", wait=30)
            
            code = None
            if provider == 'kopeechka':
                send_log("running", "polling_kopeechka", "Polling Kopeechka mailbox for verification email...")
                code = kopeechka_get_code(api_url, api_key, order_id)
            else:
                # mail.tm verification code is checked from shared_data listener
                timeout = 75
                start_time = time.time()
                while shared_data.get('verification_code') is None:
                    if time.time() - start_time > timeout:
                        raise Exception("Timed out waiting for mail.tm inbox update.")
                    time.sleep(1)
                code = shared_data['verification_code']
                
            if not code:
                raise Exception("Failed to retrieve code.")
                
            send_log("running", "entering_code", f"Entering verification code: {code}")
            human_type(driver, "input[name='code']", code)
        except Exception as e:
            send_log("error", "verification_failed", f"CRITICAL: Verification retrieval or entry failed: {str(e)}")
            driver.save_screenshot("error_verification.png")
            return False

        # Agree to Terms
        try:
            tos_box_selector = '[data-radix-scroll-area-viewport]'
            send_log("running", "terms_of_service", "Checking if Terms of Service modal needs approval...")
            if driver.is_element_present(tos_box_selector, wait=10):
                scrollable_element = driver.select(tos_box_selector)
                while scrollable_element.can_scroll_further():
                    scrollable_element.scroll_to_bottom(smooth_scroll=True)
                    time.sleep(0.5)
                driver.click("button[type='submit']")
                send_log("running", "terms_accepted", "Agreed to Terms and Conditions.")
            else:
                send_log("running", "terms_skipped", "Terms of Service modal did not appear, continuing.")
        except Exception as e:
            send_log("error", "tos_failed", f"CRITICAL: Failed to accept Terms of Service: {str(e)}")
            driver.save_screenshot("error_tos.png")
            return False

        # Confirm success
        send_log("running", "verifying_success", "Waiting for dashboard redirects to confirm success...")
        driver.short_random_sleep()
        channel_link_selector = f"a[href='/{username}']"
        if driver.is_element_present(channel_link_selector, wait=15):
            send_log("success", "completed", f"Account successfully created!", username=username, password=password, email=email)
            return True
        else:
            # Check if we are logged in by searching for user menu or avatar
            if driver.is_element_present('[data-testid="user-menu-toggle"]', wait=5):
                send_log("success", "completed", f"Account successfully created (User toggle verified)!", username=username, password=password, email=email)
                return True
            send_log("error", "confirmation_failed", "FAILURE: Registration completed, but could not confirm log-in state.")
            driver.save_screenshot("error_confirmation.png")
            return False

    return register_on_kick_task

# Email listener callback for mail.tm
def mailtm_listener(message: dict, shared_data: dict):
    subject = message.get('subject', '')
    match = re.search(r'^\s*(\d{6})', subject)
    if match:
        code = match.group(1)
        shared_data['verification_code'] = code

def run_creator():
    parser = argparse.ArgumentParser(description="Kickerz Dino Headless Runner")
    parser.add_argument("--count", type=int, default=1, help="Number of accounts to create")
    parser.add_argument("--provider", type=str, default="mailtm", choices=["mailtm", "kopeechka"], help="Email provider")
    parser.add_argument("--kopechka-key", type=str, default=None, help="Kopeechka API Key")
    parser.add_argument("--kopechka-url", type=str, default="https://api.kopeechka.store", help="Kopeechka API base URL")
    parser.add_argument("--proxy", type=str, default=None, help="Proxy URL to route browser traffic through (does NOT affect Mail.tm API)")
    
    args = parser.parse_args()

    # Build the browser task with optional proxy (proxy is ONLY used for Chrome, not Mail.tm)
    proxy_url = args.proxy if args.proxy else None
    if proxy_url:
        send_log("running", "setup", f"Configuring browser proxy routing: {proxy_url} (Mail.tm will connect directly)")
    else:
        send_log("running", "setup", "No proxy configured. Browser will connect directly.")
    
    # Create the browser task with the proxy baked into the @browser decorator
    register_task = create_browser_task(proxy_url=proxy_url)

    for i in range(args.count):
        send_log("running", "batch_start", f"Starting registration loop {i+1} of {args.count}...", index=i, total=args.count)
        
        username = generate_realistic_username()
        password = generate_complex_password()
        
        email = None
        order_id = None
        email_client = None
        shared_data = {'verification_code': None}

        try:
            if args.provider == 'kopeechka':
                if not args.kopechka_key:
                    raise Exception("Missing required --kopechka-key argument for kopeechka provider.")
                
                send_log("running", "request_email", f"Requesting target email from Kopeechka ({args.kopechka_url})...")
                email, order_id = kopeechka_get_email(args.kopechka_url, args.kopechka_key)
                send_log("running", "email_obtained", f"Assigned email: {email} (ID: {order_id})")
            else:
                send_log("running", "request_email", "Generating disposable email inbox via mail.tm...")
                email_client = Email()
                email_client.register(username=username)
                email = email_client.address
                send_log("running", "email_obtained", f"Assigned email: {email}")
                
                # Start listener thread for mail.tm
                email_client.start(lambda msg: mailtm_listener(msg, shared_data))
                send_log("running", "listener_active", "Active mail.tm notification listener started.")

            task_data = {
                'username': username,
                'password': password,
                'email': email,
                'provider': args.provider,
                'api_url': args.kopechka_url,
                'api_key': args.kopechka_key,
                'order_id': order_id,
                'email_client': email_client,
                'shared_data': shared_data
            }

            # Call Botasaurus browser runner
            success = register_task(data=task_data)
            
            if not success:
                send_log("error", "iteration_failed", f"Failed to register account for {username}.")
            
            # Clean up mail.tm listener
            if email_client:
                email_client.stop()

        except Exception as err:
            send_log("error", "execution_error", f"Unhandled error in creator execution loop: {str(err)}")
            if email_client:
                try:
                    email_client.stop()
                except:
                    pass

if __name__ == "__main__":
    try:
        run_creator()
    except KeyboardInterrupt:
        send_log("error", "interrupted", "Runner terminated by keyboard interrupt.")
        sys.exit(1)
