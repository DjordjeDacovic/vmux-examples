# vmux examples

Example scripts for [vmux](https://vmux.sdan.io). Run anything in the cloud.

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

A 5-second sanity check. Prints the working directory, lists files, counts to 5.

### Long-running Jobs

```bash
vmux run -d python epoch_counter.py
```

The `-d` flag detaches immediately. Close your laptop. The job keeps running.

```bash
vmux ps
vmux logs -f <job_id>
vmux attach <job_id>
```

### Web Servers

```bash
vmux run -p 8000 python burrow.py
```

Expose a port, get a preview URL. WebSockets just work.

Burrow is a FastAPI demo showing:
- WebSocket connection pooling and broadcasting
- Server-Sent Events streaming
- Real-time metrics dashboard
- Graceful shutdown handling

### Collaborative Terminal

```bash
vmux run -p 8000 python collab-terminal/server.py
```

A shared bash session. Multiple users connect to the same PTY via WebSocket.

### Network Probe

```bash
vmux run python netprobe.py
```

Measures latency, jitter, and packet loss to Cloudflare, Google, and AWS endpoints. Runs periodic speed tests.

### ML Training

```bash
vmux run python train_arithmetic.py
```

Teaches a 1B-parameter LLM to add numbers using reinforcement learning. Watch reward climb from ~0.66 → 1.0.

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
vmux run python train.py          # Run in the cloud
vmux run -d python train.py       # Detached mode
vmux run -p 8000 python server.py # Expose port, get preview URL

vmux ps                           # List running jobs
vmux logs -f <id>                 # Follow logs
vmux attach <id>                  # Back in your tmux session
vmux stop <id>                    # Stop a job
```

## More

See [vmux.sdan.io](https://vmux.sdan.io) for documentation.
