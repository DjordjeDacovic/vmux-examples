# vmux examples

Run any command in the cloud. These examples show what's possible with [vmux](https://vmux.sdan.io).

## Setup

```bash
uv tool install vmux-cli
vmux login
```

## Examples

### Hello World

```bash
vmux run python hello.py
```

5-second test. Prints working directory, lists files, counts to 5.

### Long-running Jobs

```bash
vmux run -d python epoch_counter.py
vmux logs -f <job_id>
```

The `-d` flag detaches immediately, returning a job ID. Use `vmux ps` to list running jobs, `vmux attach <id>` to get a terminal.

### Web Servers

```bash
vmux run -p 8000 python burrow.py
```

Starts a FastAPI server. You get a preview URL like `https://<job_id>.purr.ge` that proxies to port 8000.

The burrow demo shows:
- WebSocket broadcasting
- Server-Sent Events
- Real-time metrics dashboard
- Graceful shutdown

### Collaborative Terminal

```bash
vmux run -p 8000 python collab-terminal/server.py
```

Share a terminal session. Multiple users connect to the same bash PTY via WebSocket.

### Network Monitoring

```bash
vmux run python netprobe.py
```

Measures latency, jitter, and packet loss to Cloudflare, Google, AWS endpoints. Runs periodic speed tests.

### ML Training

```bash
vmux run python train_arithmetic.py
```

Teaches a 1B LLM to add numbers via RL. Watch reward climb from ~0.66 to 1.0.

```bash
vmux run -d python train_llama.py
```

Fine-tunes Llama-3.1-8B on instruction-following. Longer job, run detached.

Both require a Tinker API key:
```bash
vmux secret set TINKER_API_KEY
```

## CLI Reference

```
vmux run [OPTIONS] COMMAND

  -d, --detach      Run in background
  -p, --port INT    Expose port for preview URL
  -e, --env K=V     Set environment variable

vmux ps             List running jobs
vmux logs -f <id>   Follow logs
vmux attach <id>    Get a terminal
vmux stop <id>      Kill a job
```

## More

- [vmux docs](https://vmux.sdan.io)
- [CLI source](https://github.com/sdan/vmux) (coming soon)
