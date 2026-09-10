# CollabCode Production Deployment & Hosting Guide

This guide covers everything needed to run CollabCode directly from local files and deploy it to production with your custom domain.

---

## 1. Project Architecture (Three Separated Components)

CollabCode has been decoupled into three standalone components:

1. **Backend Server (`server/`)**: Express + Socket.IO + 20-Language Execution Engine.
   - Default Local Port: `4000`
   - Default Production Subdomain: `https://api.yourdomain.com`
2. **Main Application (`client/`)**: Next.js 14 Collaborative Code Editor with Monaco, Yjs CRDT, Voice/Video chat.
   - Default Local Port: `3000`
   - Default Production Domain: `https://yourdomain.com` (or `https://app.yourdomain.com`)
3. **Admin Dashboard (`admin/`)**: Standalone lightweight dashboard for competition mode, anticheat, bans, and room monitoring.
   - Default Local Port: `3001`
   - Default Production Subdomain: `https://admin.yourdomain.com`

---

## 2. How to Run Locally Directly from Files

### Step 1: Install Dependencies
Open Terminal on your Mac and navigate to the project directory:

```bash
cd /Users/namishdawar/Desktop/collabcode-main

# 1. Install Backend Dependencies
cd server && npm install

# 2. Install Client Dependencies
cd ../client && npm install
```

*(Note: The `admin` dashboard has zero external npm dependencies and runs immediately with Node's built-in HTTP module).*

### Step 2: Start the Services

You can run each service in separate terminal windows:

**Terminal 1 (Backend Server):**
```bash
cd server
npm start
# Running on http://localhost:4000
```

**Terminal 2 (Main App):**
```bash
cd client
npm run dev
# Running on http://localhost:3000
```

**Terminal 3 (Admin Dashboard):**
```bash
cd admin
npm start
# Running on http://localhost:3001
```

*(Optional: If you have PM2 installed: `npm install -g pm2 && pm2 start ecosystem.config.cjs` to start all three together).*

### Step 3: Access Locally
- **Main Coding App**: Open [http://localhost:3000](http://localhost:3000)
- **Admin Dashboard**: Open [http://localhost:3001](http://localhost:3001)
  - Default Username: `admin`
  - Default Password: `collabcode-admin`
- **Backend API Health Check**: Open [http://localhost:4000/api/health](http://localhost:4000/api/health)

---

## 3. Domain & DNS Configuration

In your domain registrar (GoDaddy, Namecheap, Cloudflare, Google Domains/Squarespace, Hostinger, etc.), create the following **DNS Records** pointing to your server's Public IP (e.g. `123.45.67.89`):

| Type | Host / Name | Value / Target | Notes |
|------|-------------|----------------|-------|
| `A` | `@` (or root) | `YOUR_SERVER_IP` | Main Web App (`yourdomain.com`) |
| `A` | `www` | `YOUR_SERVER_IP` | WWW redirect |
| `A` | `api` | `YOUR_SERVER_IP` | Backend API & WebSockets (`api.yourdomain.com`) |
| `A` | `admin` | `YOUR_SERVER_IP` | Standalone Admin Dashboard (`admin.yourdomain.com`) |

*(If using Cloudflare, make sure SSL mode is set to **Full** or **Full (Strict)**, and WebSocket support is enabled in Cloudflare Network settings).*

---

## 4. Production Hosting Options

### Option A: Complete Hosting on a Linux VPS (Recommended)
Because CollabCode executes code across 20 languages and requires persistent WebSockets for live cursor sync, a **Linux VPS (Ubuntu 22.04 or 24.04 LTS)** on **DigitalOcean ($6–$12/mo Droplet)**, **Hetzner (€4–€7/mo)**, or **AWS EC2** is the best and most cost-effective choice.

#### Step 1: Install Node.js, PM2, and Nginx on your VPS
```bash
sudo apt update && sudo apt upgrade -y
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs nginx certbot python3-certbot-nginx git build-essential
sudo npm install -g pm2
```

#### Step 2: Install Compilers for Code Execution (20 Languages)
```bash
# Core languages: C/C++, Python 3, Java, Rust, Go, PHP, Ruby, etc.
sudo apt install -y gcc g++ python3 python3-pip default-jdk rustc golang php-cli ruby bash
```

#### Step 3: Clone Code & Configure Production `.env`
Clone your repository into `/var/www/collabcode`:
```bash
sudo mkdir -p /var/www/collabcode
sudo chown -R $USER:$USER /var/www/collabcode
cd /var/www/collabcode
git clone https://github.com/dawarnamish28-cell/collabcode.git .

# Install dependencies and build client
cd server && npm install
cd ../client && npm install && npm run build
```

Configure `server/.env`:
```env
PORT=4000
NODE_ENV=production
CLIENT_URL=https://yourdomain.com
ADMIN_URL=https://admin.yourdomain.com
ALLOWED_ORIGINS=https://yourdomain.com,https://admin.yourdomain.com
MONGODB_URI=mongodb://127.0.0.1:27017/collabcode
JWT_SECRET=generate-a-random-32-char-string-here
ADMIN_JWT_SECRET=generate-another-random-string-here
ADMIN_USERNAME=admin
ADMIN_PASSWORD=SetAStrongPassword123!
```

Configure `client/.env.local`:
```env
NEXT_PUBLIC_SERVER_URL=https://api.yourdomain.com
```

Configure `admin/config.js`:
```javascript
window.COLLAB_ADMIN_CONFIG = {
  API_BASE: 'https://api.yourdomain.com',
  CLIENT_URL: 'https://yourdomain.com',
};
```

#### Step 4: Start All Services with PM2
```bash
cd /var/www/collabcode
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
```

#### Step 5: Configure Nginx Reverse Proxy
Create `/etc/nginx/sites-available/collabcode`:

```nginx
# 1. Main App (yourdomain.com)
server {
    server_name yourdomain.com www.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}

# 2. Backend Server & WebSockets (api.yourdomain.com)
server {
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }
}

# 3. Admin Dashboard (admin.yourdomain.com)
server {
    server_name admin.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable the configuration:
```bash
sudo ln -s /etc/nginx/sites-available/collabcode /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

#### Step 6: Free Automated SSL (HTTPS) with Certbot
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com -d api.yourdomain.com -d admin.yourdomain.com
```

---

### Option B: Hybrid (Vercel / Cloudflare for Frontends + VPS for Backend)

If you prefer using Vercel or Cloudflare Pages for frontends:

1. **Main App on Vercel**:
   - Link your GitHub repo to Vercel.
   - Set Root Directory to `client`.
   - Set Environment Variable: `NEXT_PUBLIC_SERVER_URL=https://api.yourdomain.com`.
   - Assign custom domain: `yourdomain.com`.
2. **Admin Dashboard on Cloudflare Pages or Vercel**:
   - Set Root Directory to `admin`.
   - Update `admin/config.js` with `API_BASE: 'https://api.yourdomain.com'`.
   - Assign custom domain: `admin.yourdomain.com`.
3. **Backend Server on VPS / Render / Railway**:
   - Deploy `server/` on a VPS (or Docker container) bound to `https://api.yourdomain.com`.

---

## 5. Summary Checklist

- [x] Backend dependencies fixed (`cookie-parser` added to `server/package.json`).
- [x] Standalone `admin/` frontend created with dynamic backend endpoint configuration.
- [x] WebRTC and socket URLs decoupled from GenSpark sandbox code.
- [x] Environment files created (`server/.env.example`, `server/.env`, `client/.env.example`, `client/.env.local`).
- [x] PM2 configuration updated to run all 3 services.
- [ ] Install dependencies locally (`cd server && npm i`, `cd client && npm i`).
- [ ] Test locally at `localhost:3000`, `localhost:3001`, and `localhost:4000`.
