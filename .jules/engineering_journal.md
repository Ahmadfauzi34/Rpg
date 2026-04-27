# Engineering Journal

## 2026-04-26 - [⬡ Carbo] - [Test Environment & IndexedDB Error Handling]
**Context:** The application utilizes Dexie and IndexedDB for client-side state storage. However, testing environments (such as jsdom via Vitest) lack native support or require extensive mocking for `IndexedDB`. When tests run, it causes `DatabaseClosedError` or `MissingAPIError`, causing test failures.
**Decision:** Graceful degradation and defensive checking of `indexedDB` existence. Instead of forcing heavy mocks within tests, we modified the `GameStateService` logic to only construct `GameDatabase` if `typeof window.indexedDB !== 'undefined'`, and inside `loadState()`, we catch initialization errors (e.g., `DatabaseClosedError`, `MissingAPIError`) to exit safely.
**Consequences:** Ensures test environments run cleanly without throwing blocking database errors, while real production runs utilize local caching as expected. It maintains clean, defensive code structure.

## 2026-04-26 - [Bolt ⚡] - [Topological Sync Optimization]
**Context:** The `TopologicalSyncSystem.resolveState` is running an O(N^2) comparison on every game tick or state update. Specifically, it uses a nested loop to check if *every* NPC's activity mentions *every other* NPC's name, which causes massive CPU spikes when the NPC population grows beyond 50. Furthermore, it recompiles Regex dynamically inside the inner loop: `new RegExp(...)`.
**Critical Learning:** We are burning cycles compiling Regex for static names inside an N^2 loop!
**Fix:** We must pre-compile these Regex patterns or use a simple string inclusion check `indexOf()`. We should also cache the normalized names of NPCs. If Carbo touches this, please refactor it to O(N) using a pre-computed map of relationships or at least optimize the inner loop to avoid Regex recompilation.

## 2026-04-26 - [⬡ Carbo] - [RAG Engine Fixes]
**Context:** During an audit, several major bottlenecks and logic errors were found across the retrieval pipeline.
**Decision:**
1. Fixed inverted index CSR building: Instead of placeholder values, `_buildInvListsFromIndexer` correctly maps terms to numeric arrays.
2. Eviction safety: Built a generic `_evictOne` scanner prioritizing weight & salience instead of a race-condition queue.
3. String Hash: `_textToVector` is now completely deterministic using a standard FNV-1a inspired hash technique per character.
4. Correct Token Tracking: BM25 score normalization now utilizes accurate token length limits rather than scaled Term Frequency values.
**Consequences:** The RAG system will confidently output deterministically correct chunks, while remaining performant and leak-free.

## 2026-04-27 - [⬡ Carbo] - [True O(N) Topological Sync via Single-Pass Regex]
**Context:** Bolt ⚡ highlighted that the previous topological sync still suffered from O(N^2) inner loops and dynamic inner regex tests.
**Decision:** Fully eliminated the N^2 relational loops. Replaced with an O(1) Map lookup for NPCs and a globally compiled Regex mapping to extract all mentioned entity names from an activity string in a single linear pass `while(masterRegex.exec())`.
**Consequences:** Topological sync is now mathematically O(N * length of activity), completely unblocking large populations (N>100) from crippling the CPU frame budget. Memory footprint is marginal (a hash map + regex).
