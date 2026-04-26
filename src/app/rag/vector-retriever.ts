export class Matrix {
  readonly rows: number;
  readonly cols: number;
  readonly data: Float32Array;

  constructor(rows: number, cols: number, data?: Float32Array) {
    this.rows = rows;
    this.cols = cols;
    this.data = data || new Float32Array(rows * cols);
  }

  transpose(): Matrix {
    const t = new Matrix(this.cols, this.rows);
    for (let i = 0; i < this.rows; i++) {
      for (let j = 0; j < this.cols; j++) {
        t.data[j * this.rows + i] = this.data[i * this.cols + j]!;
      }
    }
    return t;
  }

  static multiply(a: Matrix, b: Matrix, out: Matrix): void {
    // a: [m x n], b: [n x p], out: [m x p]
    if (a.cols !== b.rows || a.rows !== out.rows || b.cols !== out.cols) {
      throw new Error("Matrix dimensions mismatch");
    }
    out.data.fill(0);
    for (let i = 0; i < a.rows; i++) {
      for (let k = 0; k < a.cols; k++) {
        const aVal = a.data[i * a.cols + k]!;
        if (aVal === 0) continue;
        for (let j = 0; j < b.cols; j++) {
          out.data[i * b.cols + j] += aVal * b.data[k * b.cols + j]!;
        }
      }
    }
  }
}

// === POPCOUNT LUT ===
const POPCOUNT_LUT = new Uint8Array(256);
for (let i = 0; i < 256; i++) {
  let c = 0,
    n = i;
  while (n) {
    c++;
    n &= n - 1;
  }
  POPCOUNT_LUT[i] = c;
}

export function popcount32(x: number): number {
  return (
    POPCOUNT_LUT[x & 0xff]! +
    POPCOUNT_LUT[(x >>> 8) & 0xff]! +
    POPCOUNT_LUT[(x >>> 16) & 0xff]! +
    POPCOUNT_LUT[(x >>> 24) & 0xff]!
  );
}

// === TOP-K SELECTOR ===
export class TopKSelector {
  readonly k: number;
  readonly indices: Int32Array;
  readonly scores: Float32Array;
  private readonly minScore: { value: number };

  constructor(k: number) {
    this.k = k;
    this.indices = new Int32Array(k);
    this.scores = new Float32Array(k);
    this.minScore = { value: -Infinity };
    this.clear();
  }

  clear(): void {
    this.scores.fill(-Infinity);
    this.minScore.value = -Infinity;
  }

  offer(idx: number, score: number): void {
    if (score <= this.minScore.value) return;
    let i = this.k - 1;
    while (i > 0 && score > this.scores[i - 1]!) {
      this.scores[i] = this.scores[i - 1]!;
      this.indices[i] = this.indices[i - 1]!;
      i--;
    }
    this.scores[i] = score;
    this.indices[i] = idx;
    this.minScore.value = this.scores[this.k - 1]!;
  }
}

export class ExactSimilarityKernel {
  readonly dim: number;
  readonly numDocs: number;
  readonly docs: Matrix;
  readonly queryBatch: Matrix;
  readonly scoreBatch: Matrix;
  private dt: Matrix | null = null;

  constructor(
    docs: Float32Array,
    numDocs: number,
    dim: number,
    batchSize = 64,
  ) {
    this.dim = dim;
    this.numDocs = numDocs;
    this.docs = new Matrix(numDocs, dim, docs);
    this.queryBatch = new Matrix(batchSize, dim);
    this.scoreBatch = new Matrix(batchSize, numDocs);
  }

  search(
    queries: Float32Array,
    numQueries: number,
    k: number,
    outIndices: Int32Array[],
    outScores: Float32Array[],
  ): void {
    for (let i = 0; i < numQueries; i++) {
      if (outIndices[i]) outIndices[i]!.fill(-1);
      if (outScores[i]) outScores[i]!.fill(-Infinity);
    }
    const batchSize = this.queryBatch.rows;
    const numBatches = Math.ceil(numQueries / batchSize);
    if (!this.dt) this.dt = this.docs.transpose();
    const dt = this.dt;
    const selector = new TopKSelector(k);

    for (let b = 0; b < numBatches; b++) {
      const qStart = b * batchSize;
      const qEnd = Math.min(qStart + batchSize, numQueries);
      const actualBatch = qEnd - qStart;

      for (let i = 0; i < actualBatch; i++) {
        const qOff = (qStart + i) * this.dim;
        this.queryBatch.data.set(
          queries.subarray(qOff, qOff + this.dim),
          i * this.dim,
        );
      }
      for (let i = actualBatch; i < batchSize; i++) {
        this.queryBatch.data.fill(0, i * this.dim, (i + 1) * this.dim);
      }

      Matrix.multiply(this.queryBatch, dt, this.scoreBatch);

      for (let i = 0; i < actualBatch; i++) {
        const qIdx = qStart + i;
        selector.clear();
        if (selector.k !== k) {
          // If k changes across calls (rare), we'd need re-allocation, but we assume k is mostly constant
          // or we can recreate. Wait, k is passed so it's constant for this search
        }
        const rowOff = i * this.numDocs;
        for (let d = 0; d < this.numDocs; d++) {
          selector.offer(d, this.scoreBatch.data[rowOff + d]!);
        }
        outIndices[qIdx] = new Int32Array(selector.indices.slice(0, k));
        outScores[qIdx] = new Float32Array(selector.scores.slice(0, k));
      }
    }
  }
}

export class RandomProjectionLSH {
  readonly dim: number;
  readonly numBits: number;
  readonly numDocs: number;
  readonly projections: Matrix;
  readonly signatures: Uint32Array;
  readonly norms: Float32Array;

  constructor(
    dim: number,
    numBits: number,
    docs: Float32Array,
    numDocs: number,
  ) {
    if (numBits > 32) throw new Error("Max 32 bits for Uint32 signature");
    this.dim = dim;
    this.numBits = numBits;
    this.numDocs = numDocs;
    this.signatures = new Uint32Array(numDocs);
    this.norms = new Float32Array(numDocs);
    this.projections = new Matrix(numBits, dim);
    for (let i = 0; i < numBits * dim; i++) {
      const u = Math.random(),
        v = Math.random();
      const r = Math.sqrt(-2.0 * Math.log(u + 1e-10));
      const theta = 2.0 * Math.PI * v;
      this.projections.data[i] = r * Math.cos(theta);
    }

    for (let d = 0; d < numDocs; d++) {
      const off = d * dim;
      let sig = 0;
      let normSq = 0;
      for (let j = 0; j < dim; j++) {
        const val = docs[off + j]!;
        normSq += val * val;
      }
      this.norms[d] = Math.sqrt(normSq);

      for (let b = 0; b < numBits; b++) {
        let dot = 0;
        const pOff = b * dim;
        for (let j = 0; j < dim; j++) {
          dot += docs[off + j]! * this.projections.data[pOff + j]!;
        }
        if (dot > 0) sig |= 1 << b;
      }
      this.signatures[d] = sig;
    }
  }

  queryCandidates(
    query: Float32Array,
    threshold: number,
    outCandidates: Int32Array,
    maxCandidates: number,
  ): number {
    let qSig = 0;
    for (let b = 0; b < this.numBits; b++) {
      let dot = 0;
      const pOff = b * this.dim;
      for (let j = 0; j < this.dim; j++) {
        dot += query[j]! * this.projections.data[pOff + j]!;
      }
      if (dot > 0) qSig |= 1 << b;
    }

    const tks = new TopKSelector(maxCandidates);
    const seen = new Set<number>();
    
    for (let d = 0; d < this.numDocs; d++) {
      const hamming = popcount32(qSig ^ this.signatures[d]!);
      if (hamming <= threshold && !seen.has(d)) {
        tks.offer(d, -hamming);
        seen.add(d);
      }
    }
    
    let count = 0;
    for (let i = 0; i < tks.k; i++) {
        if (tks.scores[i]! > -Infinity) {
            outCandidates[count++] = tks.indices[i]!;
        }
    }
    return count;
  }
}

export class HybridVectorRetriever {
  readonly dim: number;
  readonly numDocs: number;
  readonly k: number;
  readonly docs: Float32Array;
  readonly lsh: RandomProjectionLSH;
  readonly candidateBuffer: Int32Array;
  private readonly selector: TopKSelector;

  constructor(
    docs: Float32Array,
    numDocs: number,
    dim: number,
    k: number,
    lshBits = 16,
  ) {
    this.dim = dim;
    this.numDocs = numDocs;
    this.k = k;
    this.docs = docs;
    this.lsh = new RandomProjectionLSH(dim, lshBits, docs, numDocs);
    this.candidateBuffer = new Int32Array(numDocs);
    this.selector = new TopKSelector(k);
  }

  retrieve(
    query: Float32Array,
    outIndices: Int32Array,
    outScores: Float32Array,
  ): void {
    const numCandidates = this.lsh.queryCandidates(
      query,
      4,
      this.candidateBuffer,
      this.numDocs,
    );
    const useAll = numCandidates < this.k * 2 || numCandidates === 0;

    let qNorm = 0;
    for (let j = 0; j < this.dim; j++) qNorm += query[j]! * query[j]!;
    const invQNorm = qNorm > 1e-10 ? 1.0 / Math.sqrt(qNorm) : 0;

    const selector = this.selector;
    selector.clear();

    if (useAll) {
      for (let d = 0; d < this.numDocs; d++) {
        const dOff = d * this.dim;
        let dot = 0;
        for (let j = 0; j < this.dim; j++) {
          dot += query[j]! * this.docs[dOff + j]!;
        }
        const score =
          dot *
          invQNorm *
          (this.lsh.norms[d]! > 1e-10 ? 1.0 / this.lsh.norms[d]! : 0);
        selector.offer(d, score);
      }
    } else {
      for (let i = 0; i < numCandidates; i++) {
        const d = this.candidateBuffer[i]!;
        const dOff = d * this.dim;
        let dot = 0;
        for (let j = 0; j < this.dim; j++) {
          dot += query[j]! * this.docs[dOff + j]!;
        }
        const score =
          dot *
          invQNorm *
          (this.lsh.norms[d]! > 1e-10 ? 1.0 / this.lsh.norms[d]! : 0);
        selector.offer(d, score);
      }
    }

    for (let i = 0; i < this.k; i++) {
      outIndices[i] = selector.indices[i]!;
      outScores[i] = selector.scores[i]!;
    }
  }
}
