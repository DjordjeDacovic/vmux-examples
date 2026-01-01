# vmux examples

Example scripts for [vmux](https://vmux.sdan.io). Run Python in the cloud.

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

The `-d` flag works like Docker - detach from the container and let the job run. Close your laptop.

```bash
vmux ps                    # like docker ps
vmux logs -f <job_id>      # like docker logs -f
vmux attach <job_id>       # like docker attach, but it's tmux
vmux stop <job_id>         # like docker stop
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
vmux run python train.py          # like uv run, but in the cloud
vmux run -d python train.py       # detached, like docker -d
vmux run -p 8000 python server.py # expose port, get preview URL

vmux ps                           # list running containers
vmux logs -f <id>                 # follow logs
vmux attach <id>                  # back in your tmux session
vmux stop <id>                    # stop container
```

## More

See [vmux.sdan.io](https://vmux.sdan.io) for documentation.
