# Hosting at updraft.parbs.online

One Docker container serves the game page and the height board. It runs on the Debian VM next to Scrap Riot and reaches the internet through Scrap Riot's existing Cloudflare Tunnel, the same way as Permafrost, Crunch Rally, Trailer Park Tamers and Rift Daily.

```
player ──https──> Cloudflare ──tunnel──> cloudflared (Scrap Riot's) ──> updraft:8794 (this container)
                                                                         ├─ /             the game page
                                                                         ├─ /api/start    seed for a new run
                                                                         ├─ /api/finish   replay + store a run
                                                                         ├─ /api/board    top 50, all time or this week
                                                                         └─ /health       status
```

## What it stores

One SQLite file, `/data/updraft.db`, in the named volume `updraft_data`. Each ranked run keeps a hashed player key, the name, the height, the seed and the input log (a few KB). Unused seeds live in memory for 3 hours, so a redeploy only costs players who were mid-climb their ranking for that run.

Backup, if wanted:

```sh
sg docker -c "docker compose exec updraft node -e \"new (require('node:sqlite').DatabaseSync)('/data/updraft.db').exec(\\\"VACUUM INTO '/data/backup.db'\\\")\""
sg docker -c "docker compose cp updraft:/data/backup.db ~/updraft-backup-$(date +%F).db"
```

## First-time setup on the VM

1. **Clone the repo.** It's private, so the VM needs read access: either a read-only GitHub deploy key for `nparbs/updraft`, or make the repo public and clone over HTTPS.

   ```sh
   git clone git@github.com:nparbs/updraft.git ~/updraft   # or https://github.com/nparbs/updraft.git if public
   cd ~/updraft
   cp .env.example .env
   ```

2. **Check the tunnel network name.** The container joins the network Scrap Riot's `cloudflared` is on, normally `scrap-riot_default`:

   ```sh
   sg docker -c "docker network ls" | grep scrap
   ```

   If it's different, set `TUNNEL_NETWORK` in `.env`.

3. **Start it.**

   ```sh
   sg docker -c "docker compose up -d --build"
   sg docker -c "docker compose ps"
   sg docker -c "docker compose exec updraft node -e \"fetch('http://127.0.0.1:8794/health').then(r=>r.text()).then(console.log)\""
   ```

4. **Add the hostname in Cloudflare.** Zero Trust → Networks → Tunnels → the tunnel Scrap Riot uses → Public Hostnames → Add:

   | Field | Value |
   | --- | --- |
   | Subdomain | `updraft` |
   | Domain | `parbs.online` |
   | Service | `HTTP`, `updraft:8794` |

5. **Check from anywhere:** `curl https://updraft.parbs.online/health` should return something like `{"ok":true,"version":"0.1.0","climbers":0,"pending":0}`.

## Deploying updates

Same pattern as the other games: a key on the PC that can only run the deploy script.

```sh
cp deploy/deploy-updraft.sh ~/deploy-updraft.sh && chmod +x ~/deploy-updraft.sh
# In ~/.ssh/authorized_keys, one line for the PC's updraft-deploy key:
# command="/home/deb/deploy-updraft.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty ssh-ed25519 AAAA... updraft-deploy
```

Then from the PC, `npm run ship` checks, pushes, deploys and waits for `/health` to report the new version. It reads the VM address and key from `.deploy.local.json`, which git ignores (see the top of `scripts/ship.mjs`). `npm run ship -- patch` bumps the version first.

## Limits and notes

- Per IP each minute: 40 run starts, 12 finishes, 60 board reads.
- A run can be at most 2 hours of play and 30,000 input changes. Replaying a long run costs well under a second of CPU.
- `ALLOWED_ORIGINS` rejects POSTs from other sites.
- Names are cleaned to 14 letters, digits and simple punctuation. There's no filter for rude names yet (see the roadmap).
- Player identity is a random token in the browser's storage. Clearing storage starts a new climber.

## Running it locally

```sh
npm run build && npm run server   # page and board on :8794
npm run dev                       # or: page on :5173 forwarding /api to :8794
```
