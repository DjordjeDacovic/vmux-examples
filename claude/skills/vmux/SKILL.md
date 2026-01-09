---
name: vmux
description: Deploy to vmux cloud compute. Use when user says "deploy", "vmux", "run in cloud", "preview URL", or wants to run commands on remote compute.
---

# vmux - Cloud Compute in 5 Seconds

Run any command in the cloud. Close your laptop, keep running.

## Setup

```bash
vmux whoami  # Check login status
vmux login   # If needed
```

## vmux run

```bash
vmux run [flags] <command>
```

### Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--detach` | `-d` | Run in background, return job ID immediately |
| `--port <port>` | `-p` | Expose port for preview URL (can use multiple times) |
| `--preview` | | Auto-detect port from framework and expose it |
| `--env KEY=VAL` | `-e` | Set environment variable |
| `--runtime` | `-r` | Force runtime: `python`, `bun`, or `node` |

### Flag Combinations

Flags can be combined: `-dp 8000` = detached + port 8000

```bash
vmux run python script.py           # Streams logs, blocks
vmux run -d python script.py        # Detached, returns job ID
vmux run -p 8000 python server.py   # Expose port 8000, get preview URL
vmux run -dp 8000 python server.py  # Detached + port (most common for web)
vmux run -d --preview bun run dev   # Auto-detect port from framework
vmux run -p 3000 -p 8000 npm run dev  # Multiple ports
vmux run -e API_KEY=xxx python app.py # With env var
vmux run -r bun npm run dev         # Force bun runtime
```

## After Deploy

Always give the user:
1. The **preview URL** (if port exposed) - format: `https://<job-id>.purr.ge`
2. The **job ID**
3. How to monitor: `vmux logs -f <job-id>`
4. How to stop: `vmux stop <job-id>`

## Other Commands

```bash
vmux ps                 # List running jobs
vmux logs <job-id>      # Get logs
vmux logs -f <job-id>   # Follow logs in real-time
vmux attach <job-id>    # Interactive tmux session (Ctrl+B,D to detach)
vmux stop <job-id>      # Kill job
vmux stop -a            # Stop all running jobs
vmux debug <job-id>     # Show tmux status and processes
vmux secret set KEY     # Store secret in keychain
```
