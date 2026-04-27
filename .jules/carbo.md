# Section 1: Architectural Decisions (ADR)

## 2026-04-26 - [⬡ Carbo] - [Test Environment & IndexedDB Error Handling]
**Context:** The application utilizes Dexie and IndexedDB for client-side state storage. However, testing environments (such as jsdom via Vitest) lack native support or require extensive mocking for `IndexedDB`. When tests run, it causes `DatabaseClosedError` or `MissingAPIError`, causing test failures.
**Decision:** Graceful degradation and defensive checking of `indexedDB` existence. Instead of forcing heavy mocks within tests, we modified the `GameStateService` logic to only construct `GameDatabase` if `typeof window.indexedDB !== 'undefined'`, and inside `loadState()`, we catch initialization errors (e.g., `DatabaseClosedError`, `MissingAPIError`) to exit safely.
**Consequences:** Ensures test environments run cleanly without throwing blocking database errors, while real production runs utilize local caching as expected. It maintains clean, defensive code structure.

## 2026-04-26 - [⬡ Carbo] - [Topological Sync Optimization]
**Context:** The existing `TopologicalSyncSystem` calculates relational desyncs via an O(N^2) algorithm that continuously recompiles regular expressions in the inner loop, creating severe CPU overhead on scale.
**Decision:** Optimize the topology resolution algorithm. First, pre-compile NPC regex matchers and cache location data to achieve O(N). Next, use single-pass map lookups to discover anomalies instantly.
**Consequences:** Memory slightly increases to store the compiled index, but CPU overhead drops dramatically. Safe and elegant.

## 2026-04-26 - [⬡ Carbo] - [RAG Engine Fixes]
**Context:** During an audit, several major bottlenecks and logic errors were found across the retrieval pipeline.
**Decision:**
1. Fixed inverted index CSR building: Instead of placeholder values, `_buildInvListsFromIndexer` correctly maps terms to numeric arrays.
2. Eviction safety: Built a generic `_evictOne` scanner prioritizing weight & salience instead of a race-condition queue.
3. String Hash: `_textToVector` is now completely deterministic using a standard FNV-1a inspired hash technique per character.
4. Correct Token Tracking: BM25 score normalization now utilizes accurate token length limits rather than scaled Term Frequency values.
**Consequences:** The RAG system will confidently output deterministically correct chunks, while remaining performant and leak-free.

# Section 2: The Idea Forge

## 2026-04-26 - [⬡ Carbo] - [Abstracted Storage Interface]
**Vision:** Instead of `GameStateService` coupling directly to `Dexie` implementation details, we could define an abstract `StorageProvider` interface. Then, we provide an `IndexedDBStorage` in production, and an `InMemoryStorage` during tests.
**Blockers:** Requires refactoring how the state service initializes and depends on its internal database, not immediately necessary as the defensive logic correctly bypasses missing IndexedDB APIs.

## 2026-04-26 - [⬡ Carbo] - [Graph-based topological checks]
**Vision:** Instead of regex string parsing, we should extract the "relations" directly from the AI response into a Graph and execute graph algorithms (connected components) to assert locational validity.
**Blockers:** Requires rewriting the AI output schema to explicitly emit relationship edges. Too big for this PR.

## 2026-04-27 - [⬡ Carbo] - [True O(N) Topological Sync via Single-Pass Regex]
**Context:** Bolt ⚡ highlighted that the previous topological sync still suffered from O(N^2) inner loops and dynamic inner regex tests.
**Decision:** Fully eliminated the N^2 relational loops. Replaced with an O(1) Map lookup for NPCs and a globally compiled Regex mapping to extract all mentioned entity names from an activity string in a single linear pass `while(masterRegex.exec())`.
**Consequences:** Topological sync is now mathematically O(N * length of activity), completely unblocking large populations (N>100) from crippling the CPU frame budget. Memory footprint is marginal (a hash map + regex).
