import { Injectable, signal, computed, inject } from "@angular/core";
import { GameStateService } from "../game-state.service";
import { SYSTEM_RULES } from "../system-rules";
import { BaseIndexer, BaseQuery } from "./base-indexer";
import { ChunkStore } from "./chunk-store";
import { EpistemicRetrievalKernel } from "./holographic-memory";
import { MultiWorldHologram } from "./multi-world";
import { WorldMergeResolver } from "./world-merge-resolver";
import { HybridCSRMatrix, RetrievalPipeline } from "./hybrid-pipeline";

export interface ScoredChoice {
  id: string;
  text: string;
  weight: number;
  isValid: boolean;
  failureReasons: string[];
}

export interface RetrievedLore {
  entry: { key: string; content: string };
  relevanceScore: number;
  reason: string;
}

@Injectable({ providedIn: "root" })
export class LoreEngineService {
  private indexer!: BaseIndexer;
  private store!: ChunkStore;
  private ready = false;

  // New Kernels
  private multiWorld!: MultiWorldHologram;
  private epistemicKernel!: EpistemicRetrievalKernel;
  private mergeResolver!: WorldMergeResolver;
  private readonly maxDocs = 4096;
  private readonly dim = 128;
  private docFHRR!: Float32Array;
  private docIdMap = new Map<string, number>();
  private docIdEvictQueue: string[] = [];
  private nextDocId = 0;

  // Pre-allocated buffers for retrieval
  private queryRecon!: Float32Array;
  private queryTermsBuf!: Int32Array;
  private queryIDFBuf!: Float32Array;

  readonly isReady = signal(false);
  readonly lastRetrievalMs = signal(0);

  readonly lastRetrieval = signal<RetrievedLore[]>([]);
  readonly retrievalCount = computed(() => this.lastRetrieval().length);
  readonly topRelevance = computed(
    () => this.lastRetrieval()[0]?.relevanceScore ?? 0,
  );

  private lastHash = "";
  private lastSnippet = "";

  private gameState = inject(GameStateService);

  constructor() {
    if (typeof window !== "undefined") {
      this._init();
    }
  }

  private async _init(): Promise<void> {
    try {
      this.store = new ChunkStore({
        dbName: "Guardian_Engine_v2",
        storeName: "lore_chunks",
        maxMemoryChunks: 64,
        version: 1,
      });
      await this.store.init();

      this.indexer = new BaseIndexer({
        maxDocs: this.maxDocs,
        maxResults: 128,
      });
      this.indexer.registerSchema({
        name: "location",
        type: "categorical",
        weight: 0.35,
      });
      this.indexer.registerSchema({
        name: "entity",
        type: "categorical",
        weight: 0.4,
      });
      this.indexer.registerSchema({ name: "tag", type: "tag", weight: 0.2 });
      this.indexer.registerSchema({
        name: "timestamp",
        type: "temporal",
        weight: 0.05,
      });

      this.docFHRR = new Float32Array(this.maxDocs * this.dim);
      this.multiWorld = new MultiWorldHologram(
        3,
        this.dim,
        this.maxDocs,
        64,
        this.docFHRR,
      );

      const docWeights = new Float32Array(this.maxDocs);
      this.multiWorld.initTrunk(this.docFHRR, docWeights, "trunk");

      this.queryRecon = new Float32Array(this.dim);
      this.queryTermsBuf = new Int32Array(64);
      this.queryIDFBuf = new Float32Array(64);

      const pipeline = new RetrievalPipeline(
        2048,
        this.maxDocs,
        this.dim,
        1024,
        32,
      );

      const invLists = new HybridCSRMatrix(2048, this.maxDocs, 0); // placeholder for now
      const termUB = new Float32Array(2048);
      const cooccur = new HybridCSRMatrix(2048, 2048, 0); // placeholder
      pipeline.build(invLists, termUB, cooccur, this.docFHRR);

      this.epistemicKernel = new EpistemicRetrievalKernel(
        pipeline,
        this.multiWorld.worlds[0]!,
        this.dim,
        10,
      );
      this.mergeResolver = new WorldMergeResolver(
        this.multiWorld,
        this.dim,
        this.maxDocs,
        this.docFHRR,
      );

      await this._bootstrap();
      this.ready = true;
      this.isReady.set(true);
    } catch (e) {
      console.warn("[LoreEngine] Init failed, fallback to static lore", e);
    }
  }

  async getContextSnippet(
    location: string,
    entities: string[],
    tags: string[],
    playerChoice = "",
  ): Promise<string> {
    if (!this.ready) return this._fallbackStatic();

    const kg = this.gameState.knowledgeGraph || {};
    const kgCacheKey = Object.keys(kg)
      .map((k) => `${k}:${kg[k]?.length || 0}`)
      .join(";");
    const hash = `${location}:${entities.sort().join(",")}:${tags.sort().join(",")}:${playerChoice}:${kgCacheKey}`;

    if (hash === this.lastHash && this.lastSnippet) {
      return this.lastSnippet;
    }

    const start = performance.now();

    // Extract meaningful words from player choice to boost search
    const choiceTerms =
      playerChoice.toLowerCase().match(/\b[a-z]{3,}\b/g) || [];

    const query: BaseQuery = {
      terms: [...tags, location, ...entities, ...choiceTerms].map((t) =>
        typeof t === "string" ? t.toLowerCase() : String(t),
      ),
      filters: {},
      fieldBoost: {},
      maxResults: 16,
      minScore: 0.08,
    };

    if (location) {
      query.filters[`location_${location}`] = 1;
      query.fieldBoost[`location_${location}`] = 0.35;
    }
    for (const e of entities) {
      query.filters[`entity_${e}`] = 1;
      query.fieldBoost[`entity_${e}`] = 0.4;
    }
    for (const t of tags) {
      query.filters[`tag_${t}`] = 1;
      query.fieldBoost[`tag_${t}`] = 0.2;
    }

    const queryStr = [...tags, location, ...entities, playerChoice].join(" ");
    const queryVec = this._textToVector(queryStr, this.dim);
    this.multiWorld.queryMask.fill(0);
    this.multiWorld.queryMask[0] = 1;

    // Holographic query (zero-alloc)
    const epistemicRes = this.multiWorld.epistemicQuery(
      queryVec,
      this.queryRecon,
    );

    // Hash terms for the epistemic kernel (matches pipeline term ID limits)
    const allTerms = [...tags, location, ...entities, ...choiceTerms].map(
      (t) => (typeof t === "string" ? t.toLowerCase() : String(t)),
    );
    const nq = Math.min(allTerms.length, 32);
    for (let i = 0; i < nq; i++) {
      this.queryTermsBuf[i] = this._hashTerm(allTerms[i]!) % 2048;
      this.queryIDFBuf[i] = 1.0;
    }

    const kernelRes = this.epistemicKernel.retrieve(
      this.queryTermsBuf,
      this.queryIDFBuf,
      queryVec,
      nq,
    );

    // Mark retrieved documents as rehearsed for emotional salience boost
    kernelRes.chunks.forEach((c) =>
      this.multiWorld.worlds[0]!.markRehearsed(c.index),
    );

    const scoredChunks = await this.indexer.retrieve(query, async (chunkIds) => {
      return this.store.resolveChunks(chunkIds);
    });

    const elapsed = performance.now() - start;
    this.lastRetrievalMs.set(elapsed);

    const retrieved: RetrievedLore[] = scoredChunks.map((s) => {
      const reason =
        Object.entries(s.fieldBreakdown).sort((a, b) => b[1] - a[1])[0]?.[0] ||
        "text";
      return {
        entry: { key: s.chunk.id, content: s.chunk.text },
        relevanceScore: s.score,
        reason,
      };
    });
    this.lastRetrieval.set(retrieved);

    if (retrieved.length === 0) {
      this.lastSnippet = "";
      this.lastHash = hash;
      return "";
    }

    const snippet =
      `\n=== DYNAMIC LORE CONTEXT (RAG - VSA Simulated) ===\n` +
      `[Holographic Kernel Status: Coherence ${epistemicRes.coherence.toFixed(2)}] ${epistemicRes.recommendation}\n` +
      `[Epistemic Confidence: ${kernelRes.confidence.toFixed(2)}] ${kernelRes.reason}\n\n` +
      retrieved
        .map(
          (r) =>
            `[${r.reason.toUpperCase()}|${r.relevanceScore.toFixed(2)}] ${r.entry.content}`,
        )
        .join("\n");

    this.lastSnippet = snippet;
    this.lastHash = hash;
    return snippet;
  }

  scoreChoices(
    rawChoices: {
      id: string;
      text: string;
      weight?: number;
      targetEntity?: string;
      targetFaction?: string;
      requirements?: { inventory?: string[]; trust?: Record<string, number> };
    }[],
  ): ScoredChoice[] {
    const state = this.gameState.mcState;
    const factions = this.gameState.factions;
    const trust = state.trust || {};
    const inventory = state.inventory || [];

    const out: ScoredChoice[] = new Array(Math.min(rawChoices.length, 16));
    let count = 0;

    for (const c of rawChoices) {
      if (count >= 16) break;

      let score = Math.max(0, Math.min(1, c.weight ?? 0.5));
      const failures: string[] = [];
      let valid = true;

      if ((c.requirements?.inventory?.length ?? 0) > 0) {
        const miss = c.requirements!.inventory!.filter(
          (i: string) => !inventory.includes(i),
        );
        if (miss.length > 0) {
          valid = false;
          failures.push(`Missing: ${miss.join(", ")}`);
        }
      }

      if (c.requirements?.trust && typeof c.requirements.trust === "object") {
        for (const [entityId, reqVal] of Object.entries(c.requirements.trust)) {
          const currentTrust = Number(trust[entityId]) || 0;
          if (currentTrust < Number(reqVal)) {
            valid = false;
            failures.push(
              `Trust too low: ${entityId} (Req: ${reqVal}, Cur: ${currentTrust})`,
            );
          }
        }
      }

      if (c.targetEntity && trust[c.targetEntity] !== undefined) {
        const t = Number(trust[c.targetEntity]) || 50;
        const norm = (t - 50) / 50;
        score *= 1.0 + norm * 0.25;
      }

      if (c.targetFaction && factions[c.targetFaction]) {
        const rep = factions[c.targetFaction].reputation || 0;
        score *= 1.0 + (rep / 100) * 0.3;
      }

      score = Math.max(0, Math.min(1, score));

      out[count++] = {
        id: c.id,
        text: c.text,
        weight: score,
        isValid: valid,
        failureReasons: failures,
      };
    }

    out.length = count;
    out.sort((a, b) => b.weight - a.weight);
    return out;
  }

  async syncKnowledgeGraph(): Promise<void> {
    if (!this.ready) return;
    const kg = this.gameState.knowledgeGraph;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const weights = (this.gameState as any).knowledgeWeights || {};

    for (const [entity, facts] of Object.entries(kg)) {
      for (const fact of facts) {
        const w = weights[`${entity}::${fact}`] ?? 1.0;
        const key = `kg_${entity}_${this._hash(fact)}`;
        await this._indexEntry(
          key,
          `[${entity}] ${fact}`,
          ["knowledge_graph", entity],
          w,
        );
      }
    }
  }

  private lastIndexedEpisode = -1;
  private lastIndexedLog = -1;

  async syncEpisodicMemory(): Promise<void> {
    if (!this.ready) return;

    const episodes = this.gameState.chronicle;
    // Limit to safely index the last 100 if we haven't indexed them, otherwise index only new ones
    const limitLookback = Math.max(0, episodes.length - 100);
    const startIndex = Math.max(limitLookback, this.lastIndexedEpisode + 1);

    for (let i = startIndex; i < episodes.length; i++) {
      const ep = episodes[i];
      const key = `ep_${i}`;
      const tags = [
        "episodic",
        "narrative",
        ep.mc_state?.locationName || "unknown",
      ];

      let fullNarrative = `[Episode ${i}]\n`;
      if (ep.narrative) {
        fullNarrative += ep.narrative + "\n";
      }
      if (ep.narrative_blocks && ep.narrative_blocks.length > 0) {
        fullNarrative +=
          ep.narrative_blocks
            .map((b) => {
              let blk = `[${b.name || "NPC"}]: `;
              if (b.narration) blk += `${b.narration} `;
              if (b.action) blk += `*(Action)* ${b.action} `;
              if (b.dialogue) blk += `*(Dialogue)* "${b.dialogue}"`;
              return blk.trim();
            })
            .join("\n") + "\n";
      }

      if (fullNarrative.trim().length > `[Episode ${i}]`.length) {
        await this._indexEntry(key, fullNarrative.trim(), tags, 0.8);
      }
      this.lastIndexedEpisode = i;
    }

    // Index important background logs
    const logs = this.gameState.logs;
    const logLookback = Math.max(0, logs.length - 200);
    const startLog = Math.max(logLookback, this.lastIndexedLog + 1);

    for (let i = startLog; i < logs.length; i++) {
      const log = logs[i];
      if (
        log.startsWith("[World Event]") ||
        log.startsWith("[Combat]") ||
        log.startsWith("[Quest]")
      ) {
        const key = `log_${i}`;
        await this._indexEntry(key, log, ["episodic", "world_event"], 0.6);
      }
      this.lastIndexedLog = i;
    }
  }

  private async _bootstrap(): Promise<void> {
    const book =
      (SYSTEM_RULES as { lorebook_database?: Record<string, string> })
        ?.lorebook_database || {};
    for (const [k, v] of Object.entries(book)) {
      await this._indexEntry(`static_${k}`, v as string, [
        "static",
        "lorebook",
      ]);
    }
    await this.syncKnowledgeGraph();
    await this.syncEpisodicMemory();
  }

  async refreshDynamicContext(): Promise<void> {
    await this.syncKnowledgeGraph();
    await this.syncEpisodicMemory();

    // Advance holographic memory episodic decay (lazy execution for performance)
    if (this.multiWorld && this.multiWorld.worlds[0]) {
      this.multiWorld.worlds[0].scheduleDecay(0.97, "lazy", 10);
    }
  }

  private async _indexEntry(
    key: string,
    content: string,
    tags: string[],
    baseWeight = 1.0,
  ): Promise<void> {
    const chunks = this._chunk(key, content);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta: Record<string, any> = { timestamp: Date.now() };
    for (const t of tags) meta[`tag_${t}`] = 1;
    meta[`location_${key}`] = 1;
    meta[`entity_${key}`] = 1;

    this.indexer.indexDocument(
      {
        id: key,
        metadata: meta,
        chunkIds: chunks.map((c) => c.id),
        modifiedAt: Date.now(),
        accessCount: 0,
      },
      chunks,
    );

    // Embed to RAG Holographic Kernel
    let numericId = this.docIdMap.get(key);
    if (numericId === undefined) {
      if (this.nextDocId < this.maxDocs) {
        numericId = this.nextDocId++;
        this.docIdEvictQueue.push(key);
      } else {
        while (this.docIdEvictQueue.length > 0) {
          const evictedKey = this.docIdEvictQueue.shift()!;
          const possibleId = this.docIdMap.get(evictedKey);
          if (possibleId !== undefined) {
            numericId = possibleId;
            this.docIdMap.delete(evictedKey);
            break;
          }
        }
        if (numericId === undefined) numericId = 0; // last resort fallback

        const dOff = numericId * this.dim;
        const oldVec = new Float32Array(this.dim);
        for (let i = 0; i < this.dim; i++) {
          oldVec[i] = this.docFHRR[dOff + i]!;
        }
        if (this.multiWorld && this.multiWorld.worlds[0]) {
          this.multiWorld.worlds[0].encode(numericId, oldVec, 0);
        }
        this.docIdEvictQueue.push(key);
      }
      this.docIdMap.set(key, numericId);
    }

    if (numericId !== undefined) {
      const vec = this._textToVector(content, this.dim);
      const dOff = numericId * this.dim;
      for (let i = 0; i < this.dim; i++) {
        this.docFHRR[dOff + i] = vec[i]!;
      }
      this.multiWorld.worlds[0]!.encode(numericId, vec, baseWeight);
      if (key.startsWith("ep_")) {
        this.multiWorld.worlds[0]!.setSalience(
          numericId,
          baseWeight > 1.0 ? 3.0 : 0.8,
        );
      }
    }

    await this.store.writeChunks(chunks);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private _chunk(docId: string, text: string): any[] {
    if (text.length <= 512) {
      return [
        {
          id: `${docId}_c0`,
          docId,
          text,
          termFreq: this._tf(text),
          modifiedAt: Date.now(),
        },
      ];
    }
    const out = [];
    const size = 450,
      overlap = 50;
    for (
      let pos = 0, idx = 0;
      pos < text.length;
      pos += size - overlap, idx++
    ) {
      const t = text.slice(pos, Math.min(pos + size, text.length));
      out.push({
        id: `${docId}_c${idx}`,
        docId,
        text: t,
        termFreq: this._tf(t),
        modifiedAt: Date.now(),
      });
    }
    return out;
  }

  private _tf(text: string): Map<string, number> {
    const f = new Map<string, number>();
    const words = text.toLowerCase().match(/\b\w+\b/g) || [];
    for (const w of words) f.set(w, (f.get(w) || 0) + 1);
    const m = Math.max(...f.values(), 1);
    for (const [k, v] of f) f.set(k, v / m);
    return f;
  }

  private _hash(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
      h = (h << 5) - h + s.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h).toString(36);
  }

  private _hashTerm(term: string): number {
    let h = 0;
    for (let i = 0; i < term.length; i++) {
      h = (h << 5) - h + term.charCodeAt(i);
      h |= 0;
    }
    return Math.abs(h);
  }

  private _textToVector(text: string, dim: number): Float32Array {
    const vec = new Float32Array(dim);
    let seed = 0x12345678;
    for (let i = 0; i < text.length; i++) {
        seed ^= text.charCodeAt(i);
        seed ^= seed << 13;
        seed ^= seed >>> 17;
        seed ^= seed << 5;
        const hash = (seed >>> 0) / 0xFFFFFFFF; // [0, 1]
        vec[i % dim] += hash - 0.5;
    }
    let norm = 0;
    for (let i = 0; i < dim; i++) norm += vec[i]! * vec[i]!;
    if (norm > 0) {
      norm = 1 / Math.sqrt(norm);
      for (let i = 0; i < dim; i++) vec[i] = vec[i]! * norm;
    }
    return vec;
  }

  async resolvePlayerChoice(branchWorld: number): Promise<string> {
    const result = this.mergeResolver.resolve(branchWorld, 0, 0.15, true);

    let report = `=== LORE MERGE REPORT ===\n`;
    report += `Conflicts: ${result.conflicts.length}\n`;
    report += `Auto-resolved: ${result.autoResolved}\n`;
    report += `Flagged for judgment: ${result.flaggedForLLM}\n\n`;

    for (const c of result.conflicts) {
      report += `[${c.type}] ${c.explanation}\n→ ${c.resolution}\n\n`;
    }

    return report;
  }

  private _fallbackStatic(): string {
    const keys = this.gameState.activeLoreKeys || [];
    const book =
      (SYSTEM_RULES as { lorebook_database?: Record<string, string> })
        ?.lorebook_database || {};
    const s = keys
      .filter((k: string) => book[k])
      .map((k: string) => `[${k}]: ${book[k]}`);
    return s.length ? `\n=== STATIC LORE ===\n${s.join("\n")}` : "";
  }
}
