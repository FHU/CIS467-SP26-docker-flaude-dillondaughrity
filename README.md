# Hardening a Containerized Static Site (Flaude) with nginx

---

## Learning Objectives

By the end of this lab, students will be able to:

1. Serve a static site from a custom nginx Docker container
2. Incrementally apply and verify server-side configurations
3. Use `curl` and browser DevTools to observe and validate HTTP behavior
4. Explain the purpose and tradeoff of each configuration decision
5. Write a minimal but production-realistic `nginx.conf`

---

## Lab Setup

### Project Structure

```
CIS467-SP26-docker-flaude/
├── Dockerfile
├── README.md
├── nginx.conf
├── index.html
├── src/
│   ├── app.js      
│   └── style.css
```

### Base Dockerfile

Students start with this and do not modify it — all changes happen in `nginx.conf`:

```dockerfile
FROM nginx:alpine
COPY site/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
```

### Rebuild Helper

You can use this command throughout the lab to build and run your image:

```bash
docker build -t flaude-nginx . && docker run --rm -p 8080:80 flaude-nginx
```

---

## Checkpoint 0 — Baseline (Just Serve Files)

### Goal
Confirm the site loads before any custom configuration is applied.

### nginx.conf

```nginx
events {}

http {
    include /etc/nginx/mime.types;

    server {
        listen 80;
        root /usr/share/nginx/html;
        index index.html;
    }
}
```

### Verification

```bash
curl -I http://localhost:8080/
```

**Expected:** `200 OK`, no special headers, no compression.

**Received:** 
```
HTTP/1.1 200 OK
Server: nginx/1.29.5
Date: Mon, 16 Mar 2026 23:10:14 GMT
Content-Type: text/html
Content-Length: 20470
Last-Modified: Mon, 16 Mar 2026 20:54:27 GMT
Connection: keep-alive
ETag: "69b86e03-4ff6"
Cache-Control: no-cache, must-revalidate
Accept-Ranges: bytes
```

### 0.1 - Reflection Question
> What headers does nginx send by default? Are any of them surprising?

> I didn't know what ETag was so I looked it up. 
> According to Claude: An ETag (Entity Tag) is an HTTP response header used for cache validation. It's a unique identifier — typically a hash or fingerprint — that represents a specific version of a resource.

```
Server: nginx/1.29.5
Date: Wed, 11 Mar 2026 18:21:54 GMT
Content-Type: text/html
Content-Length: 19820
Last-Modified: Wed, 11 Mar 2026 17:47:24 GMT
Connection: keep-alive
ETag: "69b1aaac-4d6c"
Accept-Ranges: bytes 
```

---

## Checkpoint 1 — Compression

### Goal
Reduce asset transfer size for text-based files using gzip.

### Changes to `nginx.conf`

Add inside the `http` block:

```nginx
gzip on;
gzip_types text/plain text/css application/javascript application/json;
gzip_min_length 1024;
```

### Verification

```bash
curl -I -H "Accept-Encoding: gzip" http://localhost:8080/index.js
```

**Expected:** `Content-Encoding: gzip`

**Received:** `Content-Encoding: gzip`

Also verify in browser DevTools → Network tab → select a JS or CSS file →
check the **Response Headers** panel.

### 1.1 Reflection Question
> Why does `gzip_min_length` exist? What's the cost of compressing a 200-byte file?

> The reason gzip_min_length exists is to make sure that you are only compressing the files that *need* to be compressed, and not just every single file.

> ChatGPT summarizes the cost of compressing a 200-byte file as this:
> Compressing a **200-byte response** with gzip (using the DEFLATE algorithm) requires the server to spend CPUtime running the full compression pipeline and adding gzip headers/footers, even though the file is tiny. The result usually saves only a few dozen bytes—and can sometimes even be **larger than the original**—so the CPU cost often isn’t worth the minimal bandwidth savings.


---

## Checkpoint 2 — Cache Control

### Goal
Apply appropriate caching strategies: aggressive caching for fingerprinted assets,
no caching for HTML entry points.

### Changes to `nginx.conf`

Add inside the `server` block:

```nginx
# HTML — always revalidate
location ~* \.html$ {
    add_header Cache-Control "no-cache, must-revalidate";
}

# Fingerprinted assets — cache for 1 year
location ~* \.(js|css|png|jpg|woff2|mp4)$ {
    add_header Cache-Control "public, max-age=31536000, immutable";
}
```

### Verification

```bash
curl -I http://localhost:8080/index.html
curl -I http://localhost:8080/assets/My_Differential_Equation.cs8LhOj6.mp4
```

**Expected:** Different `Cache-Control` values on each response.

**Received:** 
index.html: `Cache-Control: no-cache, must-revalidate`
mp4: `Cache-Control: public, max-age=31536000, immutable`

### 2.1 - Reflection Question
> Why would caching `index.html` aggressively be dangerous for a single-page app?

> It seems that if you have a single-page app, agressively caching will prevent users from receiving updates that are made to the code.

> What would happen if a user's browser cached a stale `index.html` pointing to old JS bundles?

> The user will continue to see the older version of the application, making them likely encounter errors.

---

## Checkpoint 3 — Security Headers

### Goal
Protect users from common browser-level attacks by adding standard security headers.

### Changes to `nginx.conf`

Add inside the `server` block (or a dedicated location):

```nginx
add_header X-Frame-Options "SAMEORIGIN";
add_header X-Content-Type-Options "nosniff";
add_header Referrer-Policy "strict-origin-when-cross-origin";
add_header Permissions-Policy "geolocation=(), camera=(), microphone=()";
add_header Content-Security-Policy
    "default-src 'self'; script-src 'self'; style-src 'self';";
```

### Verification

```bash
curl -I http://localhost:8080/
```

**Expected:** All five headers should appear in the response.

**Received:**
```
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), camera=(), microphone=()
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self';
```

Also check: https://securityheaders.com (enter `http://localhost:8080` if using
a tunneling tool, or deploy to a VPS for full scoring).

### 3.1 - Reflection Questions
> Break the CSP intentionally — add an inline `<script>` tag to `index.html` and observe the browser console error. What does this teach you about how CSP is enforced?

> I received an "Applying inline style violates the following Content Security Policy directive" error. It appears that when using CSP it will prevent inline scripts so that malicious inline code cannot be injected.

---

## Checkpoint 4 — SPA Routing Fallback

### Goal
Ensure that client-side routes (e.g., `/dashboard`, `/profile/42`) return
`index.html` instead of a 404, allowing JavaScript frameworks to handle routing.

### Setup

Add a link in `index.html` to a route that has no corresponding HTML file:

```html
<a href="/dashboard">Go to Dashboard</a>
```

Without the fallback, clicking this returns a 404.

### Changes to `nginx.conf`

Replace or update the default `location` block:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

### Verification

```bash
curl -I http://localhost:8080/dashboard
```

**Expected:** `200 OK` with the content of `index.html` — not a 404.

**Received:**

Also add a custom 404 page to handle truly missing assets:

```nginx
error_page 404 /404.html;
```

### 4.1 - Reflection Questions
> If every route returns `index.html` with a 200, what are the SEO implications?

> If everything returns a 200 OK, then the search engine optimization gets confused and it will start to think random pages (like /this-page-does-not-exist) are actually real and on your website.

> How do SSR frameworks like Next.js solve this problem?

> SSR frameworks, from what I understand, make it so that instead of sending everyone to the same exact file (index.html) no matter what route they enter, it will build the page before sending it so that the SEO can see the actual routes content (and the real response that comes with it).

---

## Checkpoint 5 — Rate Limiting

### Goal
Protect the server from abusive request patterns using nginx's built-in
rate limiting directives.

### Changes to `nginx.conf`

Add to the `http` block:

```nginx
limit_req_zone $binary_remote_addr zone=general:10m rate=10r/s;
```

Apply it in the `server` block:

```nginx
limit_req zone=general burst=20 nodelay;
limit_req_status 429;
```

### Verification

Use a loop to fire rapid requests:

```bash
for i in $(seq 1 30); do curl -s -o /dev/null -w "%{http_code}\n" \
  http://localhost:8080/; done
```

**Expected:** Some responses should return `429 Too Many Requests` once the burst is exhausted.

**Received**: 
```
. . .
200
429
429
429
200
429
429
429
429
200
429
429
429
200
429
429
```

### 5.1 - Reflection Question
> Rate limiting on a static site might seem overkill — when would it actually matter in production?

> There are a lot of people with malicious intent in the world. If someone wanted to do harm to your site, they could easily flood a site with millions of requests. So, by rate limiting you can ensure they do not have the potential to do so.

---

## Checkpoint 6 — Block Sensitive Paths

### Goal
Prevent accidental exposure of configuration files, version control artifacts,
or environment files that might exist in the container.

### Changes to `nginx.conf`

```nginx
location ~ /\. {
    deny all;
    return 404;
}

location ~* \.(env|git|yml|yaml|config)$ {
    deny all;
    return 404;
}
```

### Verification

```bash
# Create a test file to block
echo "SECRET=abc123" > site/.env

# Rebuild and test
curl -I http://localhost:8080/.env
```

**Expected:** `404` — not the file contents.

**Received:** `HTTP/1.1 404 Not Found`

### 6.1 - Reflection Question
> Why return `404` instead of `403 Forbidden`? What information does each status code leak to an attacker?

> By returning a 404 Not Found instead of a 403 Forbidden, you are making sure that if an attacker finds one of your secrets, rather than seeing a "403 Forbidden" message, which could inform them that the secret *exists*, you are telling them that it was "404 Not Found", which could lead them to believe that the secret is not a real secret in your application, making them leave it alone.

---

## Final nginx.conf

You should have a complete, working config. Review it as a whole and identify any ordering issues or redundancies.

---

## Deliverable: Written Reflection (Individual)

Submit a short written response (200-500 words) answering the following:

1. Which configuration had the most visible impact when you verified it? Why?

> I think that checkpoint 6 had the most impact on me. Because there are so many people that try to do harm in the world, knowing that you can use nginx to prevent this by making attackers believe that they aren't on the right trail to finding one of your environment secrets is very good information to have.

2. Choose one header or directive you added. Research what a real-world attack
   looks like that it mitigates, and describe it briefly.

> I chose to research the header X-Frame-Options: SAMEORIGIN. From what I found, this header allows you permit internal framing (such as internal dashboard widgets or help documentation) while blocking external framing which blocks third-party websites from loading your website within their own. The attack I found that this is useful against is called "clickjacking", which is a technique where an someone loads your website in their own. Users think they are clicking buttons on the attacker’s site, but they are actually clicking on hidden elements of your site.

3. What does this lab reveal about what managed hosting platforms like Netlify
   are silently doing on your behalf?

> It seems like hosting platforms have a lot more going on behind the scenes than I thought. I knew there had to be some way to ensure that people didn't just get their websites easily hacked when using Netlify (and other platforms like it), but doing this lab made me realize just how much work went into it. Considering we likely didn't even cover a majority of the ways that attackers could hack in, it shows just how much hosting platforms try to help you out.

---

## Grading Rubric

| Component | Points |
|---|---|
| All 6 checkpoints complete with working config | 40 |
| Verification commands run and output documented (screenshots or paste) | 20 |
| Written reflection — depth and specificity | 30 |
| Config is clean, commented, and well-organized | 10 |
| **Total** | **100** |
