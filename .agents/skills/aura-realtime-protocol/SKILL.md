---
name: aura-realtime-protocol
description: >-
  Use this skill when developing, debugging, or extending real-time WebSocket communication,
  presence updates, typing indicators, read receipts, or signaling protocols in the Aura project.
---

# Aura Realtime Protocol & WebSocket Specification

Aura utilizes a custom bidirectional JSON-over-WebSocket protocol hosted at `/ws` via Go Goroutines and Redis 7 Pub/Sub.

## Core Engineering Principles
1. **Zero-DB Ephemeral Load:** High-frequency events ("typing...", online presence) must NEVER hit PostgreSQL. They flow directly through Redis keys with strict TTLs (5s for typing, 60s for presence) and WebSocket broadcasts.
2. **Three-Stage WhatsApp Delivery Lifecycle:**
   - Single Gray Tick: `sent_at = NOW()` (Saved in PostgreSQL on server)
   - Double Gray Tick: `delivered_at = NOW()` (Pushed to recipient's active socket or acknowledged via `delivered_ack`)
   - Double Blue Tick: `read_at = NOW()` (Recipient rendered message in viewport, acknowledges via `read_ack`)
3. **Session Activity Preservation:** Socket events touch Redis `user:<id>:last_active`. Periodic updates (every 30s) touch PostgreSQL `user_sessions.last_active_at` without thrashing the database.

---

## WebSocket Packet Standard

All WebSocket frames are JSON strings adhering to this standard structure:

```json
{
  "action": "<action_name>",
  "payload": { ... }
}
```

---

## Client to Server Actions (`Client -> Server`)

| Action | Description | Payload Structure |
| :--- | :--- | :--- |
| `send_message` | Send a new chat message | `{"conversation_id": "uuid", "message_type": "text", "content": "Hello", "reply_to_id": null}` |
| `delivered_ack` | Acknowledge device receipt | `{"message_ids": ["uuid_1", "uuid_2"]}` |
| `read_ack` | Acknowledge viewport reading | `{"conversation_id": "uuid", "message_ids": ["uuid_1"]}` |
| `typing_start` | Broadcast typing status | `{"conversation_id": "uuid"}` (Sets Redis 5s TTL) |
| `typing_stop` | Stop typing indicator | `{"conversation_id": "uuid"}` |
| `call_initiate` | Start voice or video call | `{"conversation_id": "uuid", "call_type": "audio" \| "video"}` |
| `call_accept` | Accept incoming WebRTC call | `{"call_id": "uuid"}` |
| `call_reject` | Reject incoming call | `{"call_id": "uuid"}` |
| `call_end` | Terminate ongoing call | `{"call_id": "uuid"}` |
| `ping` | Connection heartbeat (every 20s) | `{"idle_ms": 12345}` (Responds with `pong`). `idle_ms` = ms since the user's last REAL interaction. Ping itself is NOT activity; server derives `user:<id>:last_active` = now - idle_ms. |
| `presence_state` | WhatsApp-style foreground/background | `{"visible": false, "idle_ms": 1200}` — sent on `visibilitychange`/`pagehide`/`freeze` and on socket open. User is online only while at least one connection is visible; socket stays open in background. Initial state also via WS query `?visible=0\|1`. |

---

## Server to Client Actions (`Server -> Client`)

| Action | Description | Payload Structure |
| :--- | :--- | :--- |
| `message_sent` | Single gray tick to sender | `{"temp_id": "...", "message": { "id": "uuid", "sent_at": "..." }}` |
| `new_message` | Deliver new message to recipient | `{ "id": "uuid", "conversation_id": "uuid", "sender_id": "uuid", "content": "...", "sent_at": "..." }` |
| `message_delivered` | Double gray tick to sender | `{"message_ids": ["uuid"], "delivered_at": "ISO8601"}` |
| `message_read` | Double blue tick to sender | `{"message_ids": ["uuid"], "read_at": "ISO8601"}` |
| `user_typing` | Typing indicator | `{"conversation_id": "uuid", "user_id": "uuid"}` |
| `presence_update` | Online/Offline status change | `{"user_id": "uuid", "status": 1, "last_seen_at": "ISO8601"}` |
| `incoming_call` | Fullscreen incoming call ring | `{"call_id": "uuid", "caller": { "id": "...", "display_name": "..." }, "call_type": "audio", "room_token": "..."}` |
| `call_answered` | Call accepted notification | `{"call_id": "uuid", "room_token": "..."}` |
| `call_rejected` | Call rejected or busy | `{"call_id": "uuid", "reason": "rejected" \| "busy"}` |

---

## Developer Workflow for New Events

1. **Backend Protocol:** Define payload DTO in `backend/internal/websocket/protocol.go`.
2. **Client Dispatcher:** Add handler branch in `backend/internal/websocket/client.go` inside `handleAction`.
3. **Hub Routing:** If event needs cross-user broadcast, route via `hub.go` using Redis Pub/Sub channels.
4. **Frontend Store:** Listen and process in `frontend/src/store/useSocketStore.ts` and dispatch to `useChatStore.ts` or `useCallStore.ts`.
