export type Vector = Float32Array;
export type FieldValue = string | number | boolean;

export interface IndexedChunk {
  id: string;
  docId: string;
  text: string;
  termFreq: Map<string, number>;
  tokenCount?: number;
  modifiedAt: number;
}

export interface DocumentHeader {
  id: string;
  metadata: Record<string, FieldValue>;
  chunkIds: string[];
  modifiedAt: number;
  accessCount: number;
  vectorHash?: Uint8Array;
}

export interface FieldSchema {
  name: string;
  type: 'categorical' | 'continuous' | 'temporal' | 'tag';
  weight: number;
}

export interface BaseQuery {
  terms: string[];
  filters: Record<string, FieldValue>;
  fieldBoost: Record<string, number>;
  maxResults: number;
  minScore: number;
}

export interface ScoredChunk {
  chunk: IndexedChunk;
  score: number;
  fieldBreakdown: Record<string, number>;
}

export class InvertedIndex {
  public termPostings = new Map<string, {docId: string; tf: number}[]>();
  private docFreq = new Map<string, number>();
  private totalDocs = 0;
  private scoreAcc: Float64Array;
  private readonly accSize: number;
  private docIdToIdx = new Map<string, number>();
  private idxToDocId: string[] = [];
  private docLengths: Int32Array;

  constructor(maxDocs = 8192) {
    this.accSize = maxDocs;
    this.scoreAcc = new Float64Array(maxDocs);
    this.docLengths = new Int32Array(maxDocs);
  }

  indexChunk(chunk: IndexedChunk): void {
    let idx = this.docIdToIdx.get(chunk.id);
    if (idx !== undefined) return; // Prevent double indexing
    
    idx = this.idxToDocId.length;
    if (idx >= this.accSize) {
      throw new Error('InvertedIndex capacity exceeded');
    }
    this.docIdToIdx.set(chunk.id, idx);
    this.idxToDocId.push(chunk.id);
    this.totalDocs++;

    const chunkLength = chunk.tokenCount || chunk.termFreq.size;
    for (const [term, tf] of chunk.termFreq) {
      let postings = this.termPostings.get(term);
      if (!postings) {
        postings = [];
        this.termPostings.set(term, postings);
        this.docFreq.set(term, 0);
      }
      postings.push({docId: chunk.id, tf});
      this.docFreq.set(term, (this.docFreq.get(term) || 0) + 1);
    }
    this.docLengths[idx] += chunkLength;
  }

  queryTerms(terms: string[], k1 = 1.2, b = 0.75): Float64Array {
    this.scoreAcc.fill(0);
    const avgDl = this._avgDocLength();
    for (const term of terms) {
      const postings = this.termPostings.get(term);
      if (!postings) continue;
      const df = this.docFreq.get(term) || 1;
      const idf = Math.log(1 + (this.totalDocs - df + 0.5) / (df + 0.5));
      for (const post of postings) {
        const idx = this.docIdToIdx.get(post.docId);
        if (idx === undefined) continue;
        const tf = post.tf;
        const denom = tf + k1 * (1 - b + b * (this.docLengths[idx]! / avgDl));
        const score = idf * (tf * (k1 + 1)) / (denom + 1e-6);
        this.scoreAcc[idx] += score;
      }
    }
    return this.scoreAcc;
  }

  private _avgDocLength(): number {
    if (this.totalDocs === 0) return 1;
    let totalLen = 0;
    for (let i = 0; i < this.totalDocs; i++) {
      totalLen += this.docLengths[i]!;
    }
    return totalLen / this.totalDocs;
  }

  getDocIds(): string[] {
    return this.idxToDocId;
  }
}

export class FieldIndex {
  private categorical = new Map<string, Map<string, Set<string>>>();
  private continuous = new Map<string, Map<string, number>>();
  private temporal = new Map<string, number>();

  register(docId: string, metadata: Record<string, FieldValue>): void {
    for (const [key, val] of Object.entries(metadata)) {
      if (typeof val === 'boolean' || typeof val === 'string') {
        if (!this.categorical.has(key)) this.categorical.set(key, new Map());
        const valMap = this.categorical.get(key)!;
        if (!valMap.has(String(val))) valMap.set(String(val), new Set());
        valMap.get(String(val))!.add(docId);
      } else if (typeof val === 'number') {
        if (key === 'modifiedAt' || key.endsWith('At') || key === 'timestamp') {
          this.temporal.set(docId, val);
        } else {
          if (!this.continuous.has(key)) this.continuous.set(key, new Map());
          this.continuous.get(key)!.set(docId, val);
        }
      }
    }
  }

  convolve(filters: Record<string, FieldValue>, boost: Record<string, number>): Map<string, number> {
    const scores = new Map<string, number>();
    const epsilon = 1e-6;

    for (const [field, value] of Object.entries(filters)) {
      const weight = boost[field] ?? 1.0;
      const strVal = String(value);

      const catMap = this.categorical.get(field);
      if (catMap) {
        const matches = catMap.get(strVal);
        if (matches) {
          for (const docId of matches) scores.set(docId, (scores.get(docId) || 0) + weight);
        }
      }

      const contMap = this.continuous.get(field);
      if (contMap && typeof value === 'number') {
        for (const [docId, docVal] of contMap) {
          const diff = Math.abs(docVal - value);
          const affinity = Math.exp(-diff * diff / (2 * weight * weight + epsilon));
          scores.set(docId, (scores.get(docId) || 0) + affinity * weight);
        }
      }
    }

    const now = Date.now();
    const lambda = 0.0001;
    for (const [docId, ts] of this.temporal) {
      const age = now - ts;
      const decay = Math.exp(-lambda * age);
      const existing = scores.get(docId) || 0;
      if (existing > 0) scores.set(docId, existing * (1 + decay));
    }

    return scores;
  }
}

export class BaseIndexer {
  readonly inverted: InvertedIndex;
  readonly fields: FieldIndex;
  private readonly schemas = new Map<string, FieldSchema>();
  private headers = new Map<string, DocumentHeader>();
  private chunkToDoc = new Map<string, string>();
  private resultPool: ScoredChunk[] = [];
  private readonly maxResults: number;

  constructor(options: {maxDocs?: number; maxResults?: number} = {}) {
    this.inverted = new InvertedIndex(options.maxDocs || 8192);
    this.fields = new FieldIndex();
    this.maxResults = options.maxResults || 256;
    this.resultPool = new Array(this.maxResults);
  }

  registerSchema(schema: FieldSchema): void {
    this.schemas.set(schema.name, schema);
  }

  indexDocument(header: DocumentHeader, chunks: IndexedChunk[]): void {
    this.headers.set(header.id, header);
    this.fields.register(header.id, header.metadata);
    for (const chunk of chunks) {
      this.chunkToDoc.set(chunk.id, header.id);
      this.inverted.indexChunk(chunk);
    }
  }

  async retrieve(query: BaseQuery, chunkResolver: (ids: string[]) => Promise<IndexedChunk[]>): Promise<ScoredChunk[]> {
    const fieldScores = this.fields.convolve(query.filters, this._copyBoostMap(query.fieldBoost));
    const bm25Scores = this.inverted.queryTerms(query.terms);
    const candidateIds = this._selectCandidates(fieldScores, bm25Scores, query.maxResults * 2);
    const chunks = await chunkResolver(candidateIds);
    let count = 0;
    for (const chunk of chunks) {
      const docId = this.chunkToDoc.get(chunk.id);
      if (!docId) continue;
      const idx = this.inverted['docIdToIdx'].get(chunk.id);
      const textScore = idx !== undefined ? bm25Scores[idx] : 0;
      const metaScore = fieldScores.get(docId) || 0;
      const total = textScore * 0.6 + metaScore * 0.4;
      if (total < query.minScore) continue;
      this.resultPool[count++] = { chunk, score: total, fieldBreakdown: {bm25: textScore, meta: metaScore} };
      if (count >= this.maxResults) break;
    }
    const res = this.resultPool.slice(0, count);
    res.sort((a, b) => b.score - a.score);
    return res;
  }

  private _copyBoostMap(boost: Record<string, number>): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(boost)) out[k] = v;
    return out;
  }

  private _selectCandidates(fieldScores: Map<string, number>, bm25Scores: Float64Array, limit: number): string[] {
    const set = new Set<string>();
    // Field scores -> resolve from Doc IDs to Chunk IDs
    const sortedFields = Array.from(fieldScores.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit);
    for (const [docId] of sortedFields) {
      const header = this.headers.get(docId);
      if (header) {
        for (const cid of header.chunkIds) set.add(cid);
      }
    }
    // inverted index doc IDs are naturally Chunk IDs
    const chunkIds = this.inverted.getDocIds();
    const bm25WithId = chunkIds.map((id, i) => ({id, score: bm25Scores[i]}))
      .filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
    for (const {id} of bm25WithId) set.add(id);
    return Array.from(set).slice(0, limit);
  }
}
