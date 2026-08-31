# Debug Session: chat-route-debug

- Status: OPEN
- Symptom 1: `POST /api/py/chat` crashes when inserting into `chat_logs`
- Symptom 2: `POST /api/py/chat` returns "I don't know" for an apparently answerable question

## Hypotheses

1. `chat_logs` requires `business_id`, but the route is not sending it.
2. `match_chunks` is returning no rows or weak rows for the question embedding.
3. The similarity threshold is too high for the current embedding/query shape.
4. The retrieved chunk is relevant, but the answer still escalates because of prompt behavior.
